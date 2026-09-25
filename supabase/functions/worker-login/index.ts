import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { username, password } = await req.json();

    const cleanUsername = username?.trim();
    const cleanPassword = (password ?? "").trim();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: worker } = await supabaseAdmin
      .from("workers")
      .select("*")
      .eq("username", cleanUsername)
      .maybeSingle();

    if (!worker) {
      return new Response(
        JSON.stringify({ success: false, error: "Identifiants invalides" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let passwordMatch = false;

    // Vérification réelle uniquement — aucun contournement. Un mot de passe
    // universel ici permettrait à n'importe qui de démarrer une shift/session
    // au nom de n'importe quel opérateur, ce qui est exactement le type de
    // session fictive/erronée que ce système doit empêcher.
    {
      let targetHash = (worker.password_hash || worker.pin_code_hash || "").trim();
      if (targetHash.startsWith("$2y$") || targetHash.startsWith("$2b$")) {
        targetHash = "$2a$" + targetHash.slice(4);
      }
      try {
        passwordMatch = await bcrypt.compare(cleanPassword, targetHash);
      } catch (e) {
        passwordMatch = false;
      }
    }

    if (!passwordMatch) {
      return new Response(
        JSON.stringify({ success: false, error: "Identifiants invalides" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        worker: {
          id: worker.id,
          full_name: worker.full_name,
          photo_url: worker.photo_url || null,
        },
        session_started_at: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});