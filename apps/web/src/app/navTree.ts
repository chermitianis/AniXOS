import {
  LayoutDashboard, BarChart3, Users, Landmark,
  Cog, Archive as ArchiveIcon, Shield, Settings2,
  FolderSearch, Calculator, FileBox, Clock4, BadgeCheck,
  Gauge, ClipboardCheck, ClipboardList, CalendarClock,
  HardHat, Wrench, Hammer, Package, Boxes, AlertTriangle, Layers,
  ListChecks, Users2, Link2,
  type LucideIcon,

} from "lucide-react";

export interface NavNode {
  key: string;
  labelKey: string;
  label: string;
  icon?: LucideIcon;
  pageKey?: string;
  permissionKey?: string;
  children?: NavNode[];
}

export interface NavGroup {
  key: string;
  labelKey: string;
  label: string;
  items: NavNode[];
}

const L = (
  key: string,
  label: string,
  opts: { labelKey?: string; page?: string; perm?: string; icon?: LucideIcon } = {},
): NavNode => ({
  key,
  labelKey: opts.labelKey ?? `nav.${key}`,
  label,
  pageKey: opts.page,
  permissionKey: opts.perm,
  icon: opts.icon,
});

const G = (
  key: string,
  label: string,
  children: NavNode[],
  opts: { labelKey?: string; icon?: LucideIcon } = {},
): NavNode => ({
  key,
  labelKey: opts.labelKey ?? `nav.${key}`,
  label,
  icon: opts.icon,
  children,
});

export const NAV_TREE: NavGroup[] = [
  // ─────────────────────────────────────────────────────────────
  // 01. VUE D'ENSEMBLE
  // ─────────────────────────────────────────────────────────────
  {
    key: "vue_ensemble",
    labelKey: "navGroup.overview",
    label: "Vue d'ensemble",
    items: [
      L("dashboard", "Tableau de bord", { page: "dashboard", perm: "dashboard", icon: LayoutDashboard }),
      L("reports", "Statistiques", { page: "reports", perm: "reports", icon: BarChart3 }),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 02. COMMERCIAL
  // ─────────────────────────────────────────────────────────────
  {
    key: "commercial",
    labelKey: "navGroup.commercial",
    label: "Commercial",
    items: [
      G("crm", "CRM", [
        L("crm_home", "Pipeline & Prospects", { page: "crm", perm: "crm" }),
        L("crm_clients", "Clients", { page: "clients", perm: "clients" }),
        L("crm_devis", "Devis", { page: "quotes", perm: "quotes" }),
      ], { icon: Users }),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 03. INGÉNIERIE
  // ─────────────────────────────────────────────────────────────
  {
    key: "ingenierie",
    labelKey: "navGroup.ingenierie",
    label: "Ingénierie",
    items: [
      L("ingenierie_projets", "Projets à étudier", {
        page: "projects", perm: "projects", icon: FolderSearch,
      }),
      L("ingenierie_nomenclature", "Nomenclature & chiffrage", {
        page: "nomenclature", perm: "nomenclature", icon: Calculator,
      }),
      L("ingenierie_dossiers", "Dossiers techniques", {
        page: "engineering_dossiers", perm: "nomenclature", icon: FileBox,
      }),
      L("ingenierie_gammes", "Gammes & temps", {
        page: "engineering_gammes", perm: "nomenclature", icon: Clock4,
      }),
      L("ingenierie_validation", "Validation technique", {
        page: "engineering_validation", perm: "nomenclature", icon: BadgeCheck,
      }),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 04. PRODUCTION
  // ─────────────────────────────────────────────────────────────
  {
    key: "production",
    labelKey: "navGroup.production",
    label: "Production",
    items: [
      L("production_dashboard", "Tableau de bord", {
        page: "production_dashboard", perm: "production", icon: Gauge,
      }),
      L("production_preparation", "Préparation des dossiers", {
        page: "production_preparation", perm: "production", icon: ClipboardCheck,
      }),
      L("production_ordres", "Ordres de fabrication", {
        page: "manufacturing_orders", perm: "manufacturing_orders", icon: ClipboardList,
      }),
      L("production_planification", "Planification", {
        page: "planning", perm: "planning", icon: CalendarClock,
      }),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 05. FINANCE
  // ─────────────────────────────────────────────────────────────
  {
    key: "finance",
    labelKey: "navGroup.finance",
    label: "Finance",
    items: [
      G("comptabilite", "Comptabilité", [
        L("compta_dashboard", "Tableau de bord financier", { page: "accounting", perm: "accounting" }),

        G("compta_generale", "Comptabilité générale", [
          L("compta_generale_plan", "Plan comptable"),
          L("compta_generale_journaux", "Journaux"),
          L("compta_generale_ecritures", "Écritures comptables"),
          L("compta_generale_grand_livre", "Grand livre"),
          L("compta_generale_balance", "Balance"),
          L("compta_generale_exercices", "Exercices comptables"),
          L("compta_generale_clotures", "Clôtures comptables"),
        ]),

        G("compta_clients", "Clients & encaissements", [
          L("compta_clients_factures", "Factures", { page: "invoices", perm: "invoices" }),
          L("compta_clients_avoirs", "Avoirs"),
          L("compta_clients_echeances", "Échéances"),
          L("compta_clients_encaissements", "Encaissements"),
          L("compta_clients_paiements", "Paiements reçus"),
          L("compta_clients_relances", "Relances"),
          L("compta_clients_releves", "Relevés de compte"),
          L("compta_clients_soldes", "Soldes clients"),
        ]),

        G("compta_fournisseurs", "Fournisseurs & paiements", [
          L("compta_fournisseurs_liste", "Fournisseurs"),
          L("compta_fournisseurs_factures", "Factures", { page: "purchases", perm: "purchases" }),
          L("compta_fournisseurs_avoirs", "Avoirs"),
          L("compta_fournisseurs_paiements", "Paiements"),
          L("compta_fournisseurs_echeances", "Échéances"),
          L("compta_fournisseurs_dettes", "Dettes fournisseurs"),
        ]),

        G("compta_banque", "Banque & trésorerie", [
          L("compta_banque_comptes", "Comptes bancaires"),
          L("compta_banque_mouvements", "Mouvements"),
          L("compta_banque_virements", "Virements"),
          L("compta_banque_cheques", "Chèques"),
          L("compta_banque_rapprochement", "Rapprochement bancaire"),
          L("compta_banque_previsions", "Prévisions de trésorerie"),
        ]),

        G("compta_caisse", "Caisse", [
          L("compta_caisse_entrees", "Entrées"),
          L("compta_caisse_sorties", "Sorties"),
          L("compta_caisse_justificatifs", "Justificatifs"),
          L("compta_caisse_journal", "Journal de caisse"),
          L("compta_caisse_solde", "Solde"),
          L("compta_caisse_cloture", "Clôture de caisse"),
        ]),

        G("compta_stocks", "Stocks & valorisation", [
          L("compta_stocks_valorisation", "Valorisation du stock", { page: "inventory", perm: "inventory" }),
          L("compta_stocks_valeur", "Valeur comptable"),
          L("compta_stocks_cout_moyen", "Coût moyen"),
          L("compta_stocks_inventaires", "Inventaires"),
          L("compta_stocks_ecarts", "Écarts de valorisation"),
        ]),

        G("compta_analytique", "Comptabilité analytique", [
          L("compta_analytique_centres", "Centres de coûts"),
          L("compta_analytique_machines", "Coûts machines"),
          L("compta_analytique_main_oeuvre", "Coûts de main-d'œuvre"),
          L("compta_analytique_matieres", "Coûts des matières"),
          L("compta_analytique_projets", "Coûts des projets"),
        ]),

        G("compta_controle", "Contrôle de gestion", [
          L("compta_controle_budget_reel", "Budget / Réel"),
          L("compta_controle_cout_estime", "Coût estimé / Coût réel"),
          L("compta_controle_ecarts", "Analyse des écarts"),
          L("compta_controle_marge", "Marge"),
          L("compta_controle_rentabilite", "Rentabilité par projet"),
        ]),

        G("compta_budgets", "Budgets & prévisions", [
          L("compta_budgets_liste", "Budgets"),
          L("compta_budgets_previsions", "Prévisions"),
          L("compta_budgets_realise", "Réalisé"),
          L("compta_budgets_ecarts", "Écarts budgétaires"),
        ]),

        G("compta_immobilisations", "Immobilisations", [
          L("compta_immo_machines", "Machines"),
          L("compta_immo_equipements", "Équipements"),
          L("compta_immo_vehicules", "Véhicules"),
          L("compta_immo_amortissements", "Amortissements"),
          L("compta_immo_valeur", "Valeur comptable"),
        ]),

        G("compta_paie", "Paie & charges sociales", [
          L("compta_paie_salaires", "Salaires"),
          L("compta_paie_primes", "Primes"),
          L("compta_paie_avances", "Avances"),
          L("compta_paie_heures_sup", "Heures supplémentaires"),
          L("compta_paie_charges", "Charges sociales"),
        ]),

        G("compta_fiscalite", "Fiscalité", [
          L("compta_fiscalite_tva", "TVA"),
          L("compta_fiscalite_retenues", "Retenues"),
          L("compta_fiscalite_taxes", "Taxes"),
          L("compta_fiscalite_declarations", "Déclarations"),
        ]),

        G("compta_rapports", "Rapports financiers", [
          L("compta_rapports_bilan", "Bilan"),
          L("compta_rapports_resultat", "Compte de résultat"),
          L("compta_rapports_situation_clients", "Situation clients"),
          L("compta_rapports_situation_fournisseurs", "Situation fournisseurs"),
          L("compta_rapports_tresorerie", "Trésorerie"),
          L("compta_rapports_marges", "Marges"),
        ]),
      ], { icon: Landmark }),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 06. ATELIER
  // ─────────────────────────────────────────────────────────────
  {
    key: "atelier",
    labelKey: "navGroup.atelier",
    label: "Atelier",
    items: [
      L("atelier_operateurs", "Opérateurs", { page: "workers", perm: "workers", icon: HardHat }),
      L("atelier_machines_cnc", "Machines", { page: "machines", perm: "machines", icon: Cog }),
    
      L("atelier_operations", "Opérations", { page: "operations", perm: "operations", icon: ListChecks }),
      L("atelier_outillages", "Outillages", { icon: Hammer }),
      L("atelier_matieres", "Matières & consommables", { icon: Package }),
      L("atelier_equipements", "Équipements", { icon: Boxes }),
      L("atelier_maintenance", "Maintenance", { icon: AlertTriangle }),
      L("atelier_ressources", "Ressources disponibles", { icon: Layers }),
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 07. ARCHIVES
  // ─────────────────────────────────────────────────────────────
  {
    key: "archives",
    labelKey: "navGroup.archives",
    label: "Archives",
    items: [
      L("archive", "Archives", { page: "archive", perm: "archive", icon: ArchiveIcon }),
    ],
  },

   // ─────────────────────────────────────────────────────────────
  // 08. ADMINISTRATION
  // ─────────────────────────────────────────────────────────────
  {
    key: "administration",
    labelKey: "navGroup.admin",
    label: "Administration",
    items: [
      G("admin_users", "Utilisateurs & rôles", [
        L("admin_users_liste", "Utilisateurs", { page: "admin_staff", perm: "staff" }),
        L("admin_users_roles", "Rôles", { page: "admin_roles", perm: "roles" }),
      ], { icon: Users2 }),

      G("admin_settings", "Paramètres", [
        L("admin_settings_generaux", "Paramètres généraux", { page: "admin_general_settings", perm: "settings" }),
        L("admin_settings_databases", "Bases de données", { page: "admin_databases" }),
        L("admin_settings_subscription", "Abonnement", { page: "admin_subscription" }),
      ], { icon: Settings2 }),

      G("admin_securite", "Sécurité & audit", [
        L("admin_securite_backup", "Sauvegarde / Réinitialisation", { page: "admin_database", perm: "settings" }),
        L("admin_securite_password", "Changer le mot de passe", { page: "admin_change_password" }),
        L("admin_securite_connexions", "Connexions", { page: "admin_security_qr" }),
        L("admin_securite_activites", "Activités utilisateurs"),
        L("admin_securite_historique", "Historique des modifications"),
      ], { icon: Shield }),

      G("admin_integrations", "Intégrations", [
        L("admin_integrations_odoo", "Odoo", { page: "admin_odoo", perm: "settings" }),
      ], { icon: Link2 }),
    ],
  },
];
