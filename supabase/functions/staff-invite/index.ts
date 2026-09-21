import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "unauthorized", message: "Non autorisé" }, 401);
    }

    const { invitee_email, invitee_full_name, temp_password, role_code, role_id } = await req.json();

    if (!invitee_email || !invitee_full_name || !temp_password || (!role_code && !role_id)) {
      return jsonResponse({ error: "invalid_input", message: "Tous les champs sont obligatoires" }, 400);
    }

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: callerUser },
      error: callerAuthError,
    } = await callerClient.auth.getUser();

    if (callerAuthError || !callerUser) {
      return jsonResponse({ error: "unauthorized", message: "Session invalide" }, 401);
    }

    // ملاحظة: بعد 0059، شخص واحد (auth_user_id) قد يملك أكثر من صف staff_users
    // (مالك بعدة قواعد بيانات) — عند تعدد الاحتمالات نأخذ الأول بحكم الشركة،
    // وهذا يكفي طالما ميزة "اختيار الشركة قبل الدعوة" لم تُبنَ بعد (لاحقة)
    const { data: callerStaffRows, error: callerStaffError } = await callerClient
      .from("staff_users")
      .select("company_id, is_owner, account_id")
      .eq("auth_user_id", callerUser.id)
      .eq("is_owner", true)
      .limit(1);

    const callerStaff = callerStaffRows?.[0];

    if (callerStaffError || !callerStaff) {
      return jsonResponse({ error: "unauthorized", message: "Utilisateur non trouvé" }, 403);
    }

    if (!callerStaff.is_owner) {
      return jsonResponse(
        { error: "forbidden", message: "Seul le propriétaire peut inviter des employés" },
        403
      );
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // البحث عن الدور بمرونة قصوى: أولاً عبر role_id، ثم role_code، ثم name
    let foundRoleId: string | null = null;

    if (role_id) {
      const { data: roleById } = await adminClient
        .from("roles")
        .select("id")
        .eq("id", role_id)
        .maybeSingle();
      if (roleById) foundRoleId = roleById.id;
    }

    if (!foundRoleId && role_code) {
      const { data: roleByCode } = await adminClient
        .from("roles")
        .select("id")
        .or(`code.eq.${role_code},id.eq.${role_code},name.eq.${role_code}`)
        .maybeSingle();
      if (roleByCode) foundRoleId = roleByCode.id;
    }

    if (!foundRoleId) {
      return jsonResponse({ error: "invalid_role", message: "Rôle sélectionné introuvable" }, 400);
    }

    let createdAuthUserId: string | null = null;

    try {
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email: invitee_email,
        password: temp_password,
        email_confirm: true,
      });

      if (authError || !authData?.user) {
        return jsonResponse(
          { error: "auth_creation_failed", message: authError?.message ?? "Échec de création du compte" },
          400
        );
      }

      createdAuthUserId = authData.user.id;

      const { error: staffError } = await adminClient.from("staff_users").insert({
        auth_user_id: createdAuthUserId,
        account_id: callerStaff.account_id ?? null,
        company_id: callerStaff.company_id,
        role_id: foundRoleId,
        full_name: invitee_full_name,
        email: invitee_email,
        is_owner: false,
      });

      if (staffError) {
        throw new Error(staffError.message);
      }

      return jsonResponse({
        success: true,
        staff: { id: createdAuthUserId, email: invitee_email, full_name: invitee_full_name },
      });
    } catch (innerErr: any) {
      if (createdAuthUserId) {
        await adminClient.auth.admin.deleteUser(createdAuthUserId).catch(() => {});
      }
      return jsonResponse({ error: "db_error", message: innerErr?.message || "Erreur base de données" }, 400);
    }
  } catch (err) {
    console.error("staff-invite failed:", err);
    return jsonResponse({ error: "server_error", message: "Erreur serveur" }, 500);
  }
});