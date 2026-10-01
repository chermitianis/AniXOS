// ============================================================================
// materials — Catalogue complet des matières pour l'usinage mécanique
// avec densité et prix par défaut (TND/kg).
// ============================================================================

export type MaterialCategory =
  | "acier_carbone" | "acier_allie" | "acier_inox" | "acier_outils"
  | "acier_rapide" | "acier_cementation"
  | "aluminium" | "aluminium_fonte"
  | "cuivre_alliage" | "titane" | "nickel_alliage"
  | "magnesium" | "zinc_alliage" | "plomb_etain"
  | "metal_precieux" | "metal_refractaire" | "carbure"
  | "plastique_technique" | "elastomere" | "composite"
  | "ceramique" | "bois_divers";

export interface Material {
  id: string;
  code: string;
  label: string;
  category: MaterialCategory;
  defaultUnit?: string;
  /** Densité en kg/dm³ (g/cm³). */
  density: number;
  /** Prix par défaut en TND/kg (0 = à saisir). */
  defaultPricePerKg?: number;
  note?: string;
}

export const MATERIAL_CATEGORIES: { key: MaterialCategory; label: string }[] = [
  { key: "acier_carbone",       label: "Aciers au carbone" },
  { key: "acier_allie",         label: "Aciers alliés" },
  { key: "acier_inox",          label: "Aciers inoxydables" },
  { key: "acier_outils",        label: "Aciers à outils" },
  { key: "acier_rapide",        label: "Aciers rapides (HSS)" },
  { key: "acier_cementation",   label: "Aciers de cémentation" },
  { key: "aluminium",           label: "Aluminiums & alliages" },
  { key: "aluminium_fonte",     label: "Fontes d'aluminium" },
  { key: "cuivre_alliage",      label: "Cuivres & alliages" },
  { key: "titane",              label: "Titane & alliages" },
  { key: "nickel_alliage",      label: "Nickel & superalliages" },
  { key: "magnesium",           label: "Magnésium" },
  { key: "zinc_alliage",        label: "Zinc & Zamak" },
  { key: "plomb_etain",         label: "Plomb & étain" },
  { key: "metal_precieux",      label: "Métaux précieux" },
  { key: "metal_refractaire",   label: "Métaux réfractaires" },
  { key: "carbure",             label: "Carbures" },
  { key: "plastique_technique", label: "Plastiques techniques" },
  { key: "elastomere",          label: "Élastomères" },
  { key: "composite",           label: "Composites" },
  { key: "ceramique",           label: "Céramiques techniques" },
  { key: "bois_divers",         label: "Bois & divers" },
];

export const MATERIALS: Material[] = [
  // ═══ Aciers au carbone ════════════════════════════════════════════
  { id: "s185",         code: "S185",     label: "Acier S185 (A33)",       category: "acier_carbone", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 3.0 },
  { id: "s235jr",       code: "S235JR",   label: "Acier S235JR (E24-2)",   category: "acier_carbone", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 3.2 },
  { id: "s275jr",       code: "S275JR",   label: "Acier S275JR (E28-2)",   category: "acier_carbone", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 3.4 },
  { id: "s355jr",       code: "S355JR",   label: "Acier S355JR (E36-2)",   category: "acier_carbone", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 3.8 },
  { id: "c22",          code: "C22",      label: "Acier C22 (XC22)",       category: "acier_carbone", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 3.5 },
  { id: "c35",          code: "C35",      label: "Acier C35 (XC35)",       category: "acier_carbone", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 3.6 },
  { id: "c45",          code: "C45",      label: "Acier C45 (XC45)",       category: "acier_carbone", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 3.7 },
  { id: "c60",          code: "C60",      label: "Acier C60 (XC60)",       category: "acier_carbone", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 4.0 },
  { id: "xc38",         code: "XC38",     label: "Acier XC38",             category: "acier_carbone", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 3.6 },
  { id: "xc48",         code: "XC48",     label: "Acier XC48",             category: "acier_carbone", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 3.8 },
  { id: "xc60",         code: "XC60",     label: "Acier XC60",             category: "acier_carbone", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 4.0 },
  { id: "xc65",         code: "XC65",     label: "Acier XC65",             category: "acier_carbone", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 4.2 },
  { id: "xc70",         code: "XC70",     label: "Acier XC70",             category: "acier_carbone", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 4.4 },
  { id: "e24",          code: "E24",      label: "Acier E24",              category: "acier_carbone", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 3.2 },
  { id: "e28",          code: "E28",      label: "Acier E28",              category: "acier_carbone", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 3.4 },
  { id: "e36",          code: "E36",      label: "Acier E36",              category: "acier_carbone", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 3.8 },

  // ═══ Aciers alliés ════════════════════════════════════════════════
  { id: "25crmo4",      code: "25CrMo4",  label: "Acier 25CrMo4",          category: "acier_allie", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 6.5 },
  { id: "42crmo4",      code: "42CrMo4",  label: "Acier 42CrMo4",          category: "acier_allie", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 7.0 },
  { id: "35cd4",        code: "35CD4",    label: "Acier 35CD4",            category: "acier_allie", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 6.8 },
  { id: "40cmd8",       code: "40CMD8",   label: "Acier 40CMD8",           category: "acier_allie", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 8.5 },
  { id: "34crnimo6",    code: "34CrNiMo6",label: "Acier 34CrNiMo6",        category: "acier_allie", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 9.0 },
  { id: "30crmov9",     code: "30CrMoV9", label: "Acier 30CrMoV9",         category: "acier_allie", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 9.5 },
  { id: "35ncd16",      code: "35NCD16",  label: "Acier 35NCD16",          category: "acier_allie", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 11.0 },
  { id: "40ncd3",       code: "40NCD3",   label: "Acier 40NCD3",           category: "acier_allie", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 9.5 },
  { id: "50crv4",       code: "50CrV4",   label: "Acier 50CrV4",           category: "acier_allie", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 8.0 },
  { id: "61sc7",        code: "61SC7",    label: "Acier 61SC7",            category: "acier_allie", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 6.0 },
  { id: "20m5",         code: "20M5",     label: "Acier 20M5",             category: "acier_allie", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 5.5 },
  { id: "35m5",         code: "35M5",     label: "Acier 35M5",             category: "acier_allie", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 6.0 },

  // ═══ Aciers inoxydables ═══════════════════════════════════════════
  { id: "inox_304",     code: "304",       label: "Inox 304 (X5CrNi18-10)",         category: "acier_inox", defaultUnit: "kg", density: 7.90, defaultPricePerKg: 14.0 },
  { id: "inox_304l",    code: "304L",      label: "Inox 304L (X2CrNi18-10)",        category: "acier_inox", defaultUnit: "kg", density: 7.90, defaultPricePerKg: 15.0 },
  { id: "inox_316",     code: "316",       label: "Inox 316 (X5CrNiMo17-12-2)",     category: "acier_inox", defaultUnit: "kg", density: 8.00, defaultPricePerKg: 18.0 },
  { id: "inox_316l",    code: "316L",      label: "Inox 316L",                      category: "acier_inox", defaultUnit: "kg", density: 8.00, defaultPricePerKg: 19.0 },
  { id: "inox_316ti",   code: "316Ti",     label: "Inox 316Ti",                     category: "acier_inox", defaultUnit: "kg", density: 8.00, defaultPricePerKg: 20.0 },
  { id: "inox_321",     code: "321",       label: "Inox 321",                       category: "acier_inox", defaultUnit: "kg", density: 7.90, defaultPricePerKg: 20.0 },
  { id: "inox_347",     code: "347",       label: "Inox 347",                       category: "acier_inox", defaultUnit: "kg", density: 8.00, defaultPricePerKg: 22.0 },
  { id: "inox_410",     code: "410",       label: "Inox 410 (X12Cr13)",             category: "acier_inox", defaultUnit: "kg", density: 7.75, defaultPricePerKg: 6.0 },
  { id: "inox_420",     code: "420",       label: "Inox 420 (X20Cr13)",             category: "acier_inox", defaultUnit: "kg", density: 7.75, defaultPricePerKg: 7.0 },
  { id: "inox_430",     code: "430",       label: "Inox 430 (X6Cr17)",              category: "acier_inox", defaultUnit: "kg", density: 7.70, defaultPricePerKg: 8.0 },
  { id: "inox_440c",    code: "440C",      label: "Inox 440C (X105CrMo17)",         category: "acier_inox", defaultUnit: "kg", density: 7.70, defaultPricePerKg: 14.0 },
  { id: "inox_17_4ph",  code: "17-4PH",    label: "Inox 17-4PH",                    category: "acier_inox", defaultUnit: "kg", density: 7.80, defaultPricePerKg: 40.0 },
  { id: "inox_15_5ph",  code: "15-5PH",    label: "Inox 15-5PH",                    category: "acier_inox", defaultUnit: "kg", density: 7.80, defaultPricePerKg: 42.0 },
  { id: "inox_2205",    code: "2205",      label: "Inox duplex 2205",               category: "acier_inox", defaultUnit: "kg", density: 7.80, defaultPricePerKg: 30.0 },
  { id: "inox_2507",    code: "2507",      label: "Inox super-duplex 2507",         category: "acier_inox", defaultUnit: "kg", density: 7.80, defaultPricePerKg: 45.0 },
  { id: "inox_904l",    code: "904L",      label: "Inox 904L",                      category: "acier_inox", defaultUnit: "kg", density: 8.00, defaultPricePerKg: 55.0 },
  { id: "inox_254smo",  code: "254SMO",    label: "Inox 254 SMO",                   category: "acier_inox", defaultUnit: "kg", density: 8.00, defaultPricePerKg: 60.0 },

  // ═══ Aciers à outils ══════════════════════════════════════════════
  { id: "x100crv5",     code: "X100CrV5",    label: "Acier à outils X100CrV5",       category: "acier_outils", defaultUnit: "kg", density: 7.80, defaultPricePerKg: 12.0 },
  { id: "x100crmov5",   code: "X100CrMoV5",  label: "Acier à outils X100CrMoV5 (A2)",category: "acier_outils", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 14.0 },
  { id: "x153crmov12",  code: "X153CrMoV12", label: "Acier à outils X153CrMoV12 (D2)", category: "acier_outils", defaultUnit: "kg", density: 7.70, defaultPricePerKg: 16.0 },
  { id: "x210cr12",     code: "X210Cr12",    label: "Acier à outils X210Cr12 (D3)",  category: "acier_outils", defaultUnit: "kg", density: 7.70, defaultPricePerKg: 15.0 },
  { id: "90mncrv8",     code: "90MnCrV8",    label: "Acier à outils 90MnCrV8 (O2)",  category: "acier_outils", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 10.0 },
  { id: "x40crmov5_1",  code: "X40CrMoV5-1", label: "Acier à outils X40CrMoV5-1 (H13)", category: "acier_outils", defaultUnit: "kg", density: 7.80, defaultPricePerKg: 18.0 },
  { id: "x38crmov5_3",  code: "X38CrMoV5-3", label: "Acier à outils X38CrMoV5-3",    category: "acier_outils", defaultUnit: "kg", density: 7.80, defaultPricePerKg: 20.0 },
  { id: "x32crmov33",   code: "X32CrMoV33",  label: "Acier à outils X32CrMoV33",     category: "acier_outils", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 22.0 },
  { id: "55nicrmov7",   code: "55NiCrMoV7",  label: "Acier à outils 55NiCrMoV7",     category: "acier_outils", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 15.0 },
  { id: "x155crvmo121", code: "X155CrVMo12-1",label: "Acier à outils X155CrVMo12-1",category: "acier_outils", defaultUnit: "kg", density: 7.70, defaultPricePerKg: 17.0 },

  // ═══ Aciers rapides (HSS) ═════════════════════════════════════════
  { id: "hss_m2",       code: "HS6-5-2",     label: "HSS M2 (HS6-5-2)",       category: "acier_rapide", defaultUnit: "kg", density: 8.15, defaultPricePerKg: 25.0 },
  { id: "hss_m35",      code: "HS6-5-2-5",   label: "HSS M35 (HS6-5-2-5)",    category: "acier_rapide", defaultUnit: "kg", density: 8.15, defaultPricePerKg: 35.0 },
  { id: "hss_m42",      code: "HS2-9-1-8",   label: "HSS M42 (HS2-9-1-8)",    category: "acier_rapide", defaultUnit: "kg", density: 8.10, defaultPricePerKg: 40.0 },
  { id: "hss_t15",      code: "HS12-1-5-5",  label: "HSS T15 (HS12-1-5-5)",   category: "acier_rapide", defaultUnit: "kg", density: 8.70, defaultPricePerKg: 60.0 },
  { id: "hss_pm23",     code: "PM23",        label: "HSS PM23 (ASP23)",       category: "acier_rapide", defaultUnit: "kg", density: 8.10, defaultPricePerKg: 80.0 },
  { id: "hss_pm30",     code: "PM30",        label: "HSS PM30 (ASP30)",       category: "acier_rapide", defaultUnit: "kg", density: 8.10, defaultPricePerKg: 95.0 },
  { id: "hss_pm60",     code: "PM60",        label: "HSS PM60 (ASP60)",       category: "acier_rapide", defaultUnit: "kg", density: 8.10, defaultPricePerKg: 130.0 },

  // ═══ Aciers de cémentation ════════════════════════════════════════
  { id: "16nc6",        code: "16NC6",    label: "Acier 16NC6",            category: "acier_cementation", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 5.5 },
  { id: "18cnd6",       code: "18CND6",   label: "Acier 18CND6",           category: "acier_cementation", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 6.5 },
  { id: "20mc5",        code: "20MC5",    label: "Acier 20MC5",            category: "acier_cementation", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 5.8 },
  { id: "20nc6",        code: "20NC6",    label: "Acier 20NC6",            category: "acier_cementation", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 5.5 },
  { id: "22cnd4",       code: "22CND4",   label: "Acier 22CND4",           category: "acier_cementation", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 7.0 },
  { id: "25cd4",        code: "25CD4",    label: "Acier 25CD4",            category: "acier_cementation", defaultUnit: "kg", density: 7.85, defaultPricePerKg: 6.5 },

  // ═══ Aluminiums ═══════════════════════════════════════════════════
  { id: "alu_1050",     code: "1050A",    label: "Alu 1050A",              category: "aluminium", defaultUnit: "kg", density: 2.70, defaultPricePerKg: 8.0 },
  { id: "alu_1100",     code: "1100",     label: "Alu 1100",               category: "aluminium", defaultUnit: "kg", density: 2.71, defaultPricePerKg: 8.0 },
  { id: "alu_2017a",    code: "2017A",    label: "Alu 2017A (AU4G)",       category: "aluminium", defaultUnit: "kg", density: 2.80, defaultPricePerKg: 10.0 },
  { id: "alu_2024",     code: "2024",     label: "Alu 2024 (AU4G1)",       category: "aluminium", defaultUnit: "kg", density: 2.78, defaultPricePerKg: 12.0 },
  { id: "alu_2618",     code: "2618",     label: "Alu 2618",               category: "aluminium", defaultUnit: "kg", density: 2.76, defaultPricePerKg: 15.0 },
  { id: "alu_3003",     code: "3003",     label: "Alu 3003",               category: "aluminium", defaultUnit: "kg", density: 2.73, defaultPricePerKg: 8.5 },
  { id: "alu_5083",     code: "5083",     label: "Alu 5083",               category: "aluminium", defaultUnit: "kg", density: 2.66, defaultPricePerKg: 11.0 },
  { id: "alu_5754",     code: "5754",     label: "Alu 5754 (AG4-0)",       category: "aluminium", defaultUnit: "kg", density: 2.66, defaultPricePerKg: 11.0 },
  { id: "alu_6060",     code: "6060",     label: "Alu 6060",               category: "aluminium", defaultUnit: "kg", density: 2.70, defaultPricePerKg: 9.0 },
  { id: "alu_6061",     code: "6061",     label: "Alu 6061 (AG6)",         category: "aluminium", defaultUnit: "kg", density: 2.70, defaultPricePerKg: 10.0 },
  { id: "alu_6082",     code: "6082",     label: "Alu 6082 (AG7)",         category: "aluminium", defaultUnit: "kg", density: 2.71, defaultPricePerKg: 10.5 },
  { id: "alu_7020",     code: "7020",     label: "Alu 7020",               category: "aluminium", defaultUnit: "kg", density: 2.78, defaultPricePerKg: 14.0 },
  { id: "alu_7075",     code: "7075",     label: "Alu 7075 (AZ5GU)",       category: "aluminium", defaultUnit: "kg", density: 2.81, defaultPricePerKg: 18.0 },

  // ═══ Fontes d'aluminium ═══════════════════════════════════════════
  { id: "alsi7",        code: "AlSi7",    label: "Fonte d'alu AlSi7",      category: "aluminium_fonte", defaultUnit: "kg", density: 2.68, defaultPricePerKg: 9.0 },
  { id: "alsi10mg",     code: "AlSi10Mg", label: "Fonte d'alu AlSi10Mg",   category: "aluminium_fonte", defaultUnit: "kg", density: 2.67, defaultPricePerKg: 9.5 },
  { id: "alsi12",       code: "AlSi12",   label: "Fonte d'alu AlSi12",     category: "aluminium_fonte", defaultUnit: "kg", density: 2.66, defaultPricePerKg: 9.0 },
  { id: "alsi9cu3",     code: "AlSi9Cu3", label: "Fonte d'alu AlSi9Cu3",   category: "aluminium_fonte", defaultUnit: "kg", density: 2.75, defaultPricePerKg: 10.0 },

  // ═══ Cuivres & alliages ═══════════════════════════════════════════
  { id: "cu_c11000",    code: "Cu-C11000",label: "Cuivre C11000 (Cu-ETP)", category: "cuivre_alliage", defaultUnit: "kg", density: 8.90, defaultPricePerKg: 30.0 },
  { id: "cu_c12200",    code: "Cu-C12200",label: "Cuivre C12200 (Cu-DHP)", category: "cuivre_alliage", defaultUnit: "kg", density: 8.90, defaultPricePerKg: 30.0 },
  { id: "cu_cuof",      code: "Cu-OF",    label: "Cuivre Cu-OF",           category: "cuivre_alliage", defaultUnit: "kg", density: 8.90, defaultPricePerKg: 35.0 },
  { id: "laiton_cuzn37",code: "CuZn37",   label: "Laiton CuZn37",          category: "cuivre_alliage", defaultUnit: "kg", density: 8.44, defaultPricePerKg: 22.0 },
  { id: "laiton_cuzn39pb2",code:"CuZn39Pb2",label:"Laiton CuZn39Pb2",      category: "cuivre_alliage", defaultUnit: "kg", density: 8.45, defaultPricePerKg: 23.0 },
  { id: "laiton_cuzn40pb2",code:"CuZn40Pb2",label:"Laiton CuZn40Pb2",      category: "cuivre_alliage", defaultUnit: "kg", density: 8.45, defaultPricePerKg: 23.0 },
  { id: "bronze_cusn6", code: "CuSn6",    label: "Bronze CuSn6",           category: "cuivre_alliage", defaultUnit: "kg", density: 8.85, defaultPricePerKg: 35.0 },
  { id: "bronze_cusn8", code: "CuSn8",    label: "Bronze CuSn8",           category: "cuivre_alliage", defaultUnit: "kg", density: 8.80, defaultPricePerKg: 38.0 },
  { id: "bronze_cusn12",code: "CuSn12",   label: "Bronze CuSn12",          category: "cuivre_alliage", defaultUnit: "kg", density: 8.75, defaultPricePerKg: 40.0 },
  { id: "bronze_cual10fe",code:"CuAl10Fe",label:"Bronze alu CuAl10Fe",     category: "cuivre_alliage", defaultUnit: "kg", density: 7.60, defaultPricePerKg: 42.0 },
  { id: "cube_cuBe2",   code: "CuBe2",    label: "Cupro-béryllium CuBe2",  category: "cuivre_alliage", defaultUnit: "kg", density: 8.25, defaultPricePerKg: 220.0 },
  { id: "cube_cube1_7", code: "CuBe1.7",  label: "Cupro-béryllium CuBe1.7",category: "cuivre_alliage", defaultUnit: "kg", density: 8.25, defaultPricePerKg: 210.0 },

  // ═══ Titane ═══════════════════════════════════════════════════════
  { id: "ti_t40",       code: "T40",      label: "Titane T40 (grade 2)",   category: "titane", defaultUnit: "kg", density: 4.51, defaultPricePerKg: 120.0 },
  { id: "ti_t60",       code: "T60",      label: "Titane T60 (TA6V/grade 5)", category: "titane", defaultUnit: "kg", density: 4.43, defaultPricePerKg: 150.0 },
  { id: "ti_grade7",    code: "Ti-G7",    label: "Titane grade 7",         category: "titane", defaultUnit: "kg", density: 4.51, defaultPricePerKg: 180.0 },
  { id: "ti_ti3al25v",  code: "Ti-3Al-2.5V", label: "Titane Ti-3Al-2.5V",  category: "titane", defaultUnit: "kg", density: 4.48, defaultPricePerKg: 160.0 },
  { id: "ti_ti6242",    code: "Ti-6242",  label: "Titane Ti-6242",         category: "titane", defaultUnit: "kg", density: 4.54, defaultPricePerKg: 220.0 },

  // ═══ Nickel & superalliages ═══════════════════════════════════════
  { id: "ni_200",       code: "Ni200",       label: "Nickel Ni200",           category: "nickel_alliage", defaultUnit: "kg", density: 8.89, defaultPricePerKg: 90.0 },
  { id: "ni_201",       code: "Ni201",       label: "Nickel Ni201",           category: "nickel_alliage", defaultUnit: "kg", density: 8.89, defaultPricePerKg: 92.0 },
  { id: "inconel_600",  code: "Inconel600",  label: "Inconel 600",            category: "nickel_alliage", defaultUnit: "kg", density: 8.47, defaultPricePerKg: 180.0 },
  { id: "inconel_625",  code: "Inconel625",  label: "Inconel 625",            category: "nickel_alliage", defaultUnit: "kg", density: 8.44, defaultPricePerKg: 250.0 },
  { id: "inconel_718",  code: "Inconel718",  label: "Inconel 718",            category: "nickel_alliage", defaultUnit: "kg", density: 8.19, defaultPricePerKg: 280.0 },
  { id: "inconel_x750", code: "InconelX750", label: "Inconel X-750",          category: "nickel_alliage", defaultUnit: "kg", density: 8.28, defaultPricePerKg: 200.0 },
  { id: "monel_400",    code: "Monel400",    label: "Monel 400",              category: "nickel_alliage", defaultUnit: "kg", density: 8.80, defaultPricePerKg: 200.0 },
  { id: "monel_k500",   code: "MonelK500",   label: "Monel K-500",            category: "nickel_alliage", defaultUnit: "kg", density: 8.44, defaultPricePerKg: 240.0 },
  { id: "hastelloy_c276",code:"HastelloyC276",label:"Hastelloy C-276",        category: "nickel_alliage", defaultUnit: "kg", density: 8.89, defaultPricePerKg: 320.0 },
  { id: "hastelloy_b2", code: "HastelloyB2", label: "Hastelloy B-2",          category: "nickel_alliage", defaultUnit: "kg", density: 9.22, defaultPricePerKg: 300.0 },
  { id: "nitronic_60",  code: "Nitronic60",  label: "Nitronic 60",            category: "nickel_alliage", defaultUnit: "kg", density: 7.90, defaultPricePerKg: 60.0 },

  // ═══ Magnésium ════════════════════════════════════════════════════
  { id: "mg_az31",      code: "AZ31",     label: "Magnésium AZ31",         category: "magnesium", defaultUnit: "kg", density: 1.77, defaultPricePerKg: 60.0 },
  { id: "mg_az61",      code: "AZ61",     label: "Magnésium AZ61",         category: "magnesium", defaultUnit: "kg", density: 1.80, defaultPricePerKg: 65.0 },
  { id: "mg_az91",      code: "AZ91",     label: "Magnésium AZ91",         category: "magnesium", defaultUnit: "kg", density: 1.81, defaultPricePerKg: 70.0 },
  { id: "mg_zk60",      code: "ZK60",     label: "Magnésium ZK60",         category: "magnesium", defaultUnit: "kg", density: 1.83, defaultPricePerKg: 90.0 },

  // ═══ Zinc & Zamak ═════════════════════════════════════════════════
  { id: "zn_pur",       code: "Zn",       label: "Zinc pur",               category: "zinc_alliage", defaultUnit: "kg", density: 7.14, defaultPricePerKg: 12.0 },
  { id: "zamak_3",      code: "Zamak3",   label: "Zamak 3",                category: "zinc_alliage", defaultUnit: "kg", density: 6.60, defaultPricePerKg: 14.0 },
  { id: "zamak_5",      code: "Zamak5",   label: "Zamak 5",                category: "zinc_alliage", defaultUnit: "kg", density: 6.70, defaultPricePerKg: 15.0 },
  { id: "za_8",         code: "ZA-8",     label: "ZA-8",                   category: "zinc_alliage", defaultUnit: "kg", density: 6.30, defaultPricePerKg: 16.0 },

  // ═══ Plomb & étain ════════════════════════════════════════════════
  { id: "pb_pur",       code: "Pb",       label: "Plomb pur",              category: "plomb_etain", defaultUnit: "kg", density: 11.34, defaultPricePerKg: 12.0 },
  { id: "sn_pur",       code: "Sn",       label: "Étain pur",              category: "plomb_etain", defaultUnit: "kg", density: 7.30, defaultPricePerKg: 80.0 },
  { id: "soudure_sn60pb40", code: "Sn60Pb40", label: "Soudure Sn60Pb40",   category: "plomb_etain", defaultUnit: "kg", density: 8.50, defaultPricePerKg: 40.0 },
  { id: "soudure_sn63pb37", code: "Sn63Pb37", label: "Soudure Sn63Pb37",   category: "plomb_etain", defaultUnit: "kg", density: 8.40, defaultPricePerKg: 42.0 },
  { id: "soudure_sac305",   code: "SAC305",   label: "Soudure SAC305",     category: "plomb_etain", defaultUnit: "kg", density: 7.40, defaultPricePerKg: 90.0 },

  // ═══ Métaux précieux ══════════════════════════════════════════════
  { id: "ag_pur",       code: "Ag",       label: "Argent pur (999)",       category: "metal_precieux", defaultUnit: "g", density: 10.49, defaultPricePerKg: 2500.0 },
  { id: "ag_925",       code: "Ag925",    label: "Argent sterling (925)",  category: "metal_precieux", defaultUnit: "g", density: 10.36, defaultPricePerKg: 2300.0 },
  { id: "au_24k",       code: "Au24K",    label: "Or 24 carats",           category: "metal_precieux", defaultUnit: "g", density: 19.30, defaultPricePerKg: 220000.0 },
  { id: "au_18k",       code: "Au18K",    label: "Or 18 carats",           category: "metal_precieux", defaultUnit: "g", density: 15.50, defaultPricePerKg: 165000.0 },
  { id: "pt_pur",       code: "Pt",       label: "Platine",                category: "metal_precieux", defaultUnit: "g", density: 21.45, defaultPricePerKg: 95000.0 },
  { id: "pd_pur",       code: "Pd",       label: "Palladium",              category: "metal_precieux", defaultUnit: "g", density: 12.02, defaultPricePerKg: 120000.0 },

  // ═══ Métaux réfractaires ══════════════════════════════════════════
  { id: "w_pur",        code: "W",        label: "Tungstène",             category: "metal_refractaire", defaultUnit: "kg", density: 19.30, defaultPricePerKg: 250.0 },
  { id: "mo_pur",       code: "Mo",       label: "Molybdène",             category: "metal_refractaire", defaultUnit: "kg", density: 10.28, defaultPricePerKg: 180.0 },
  { id: "ta_pur",       code: "Ta",       label: "Tantale",                category: "metal_refractaire", defaultUnit: "kg", density: 16.65, defaultPricePerKg: 800.0 },
  { id: "nb_pur",       code: "Nb",       label: "Niobium",                category: "metal_refractaire", defaultUnit: "kg", density: 8.57, defaultPricePerKg: 350.0 },
  { id: "zr_pur",       code: "Zr",       label: "Zirconium",              category: "metal_refractaire", defaultUnit: "kg", density: 6.51, defaultPricePerKg: 200.0 },

  // ═══ Carbures ═════════════════════════════════════════════════════
  { id: "wc",           code: "WC",       label: "Carbure de tungstène (WC)", category: "carbure", defaultUnit: "kg", density: 15.63, defaultPricePerKg: 320.0 },
  { id: "tic",          code: "TiC",      label: "Carbure de titane (TiC)",   category: "carbure", defaultUnit: "kg", density: 4.93,  defaultPricePerKg: 400.0 },
  { id: "tac",          code: "TaC",      label: "Carbure de tantale (TaC)",  category: "carbure", defaultUnit: "kg", density: 14.50, defaultPricePerKg: 900.0 },
  { id: "wc_co",        code: "WC-Co",    label: "Carbure fritté WC-Co",      category: "carbure", defaultUnit: "kg", density: 14.90, defaultPricePerKg: 280.0 },

  // ═══ Plastiques techniques ════════════════════════════════════════
  { id: "pom_c",        code: "POM-C",    label: "POM-C (Delrin blanc)",   category: "plastique_technique", defaultUnit: "kg", density: 1.41, defaultPricePerKg: 25.0 },
  { id: "pom_h",        code: "POM-H",    label: "POM-H (Delrin noir)",    category: "plastique_technique", defaultUnit: "kg", density: 1.43, defaultPricePerKg: 27.0 },
  { id: "pa6",          code: "PA6",      label: "Polyamide PA6 (Nylon)",  category: "plastique_technique", defaultUnit: "kg", density: 1.14, defaultPricePerKg: 22.0 },
  { id: "pa66",         code: "PA66",     label: "Polyamide PA66",         category: "plastique_technique", defaultUnit: "kg", density: 1.15, defaultPricePerKg: 25.0 },
  { id: "pa6g",         code: "PA6G",     label: "Polyamide PA6G (coulé)", category: "plastique_technique", defaultUnit: "kg", density: 1.15, defaultPricePerKg: 35.0 },
  { id: "peek",         code: "PEEK",     label: "PEEK",                   category: "plastique_technique", defaultUnit: "kg", density: 1.30, defaultPricePerKg: 350.0 },
  { id: "peek_cf",      code: "PEEK-CF",  label: "PEEK renforcé carbone",  category: "plastique_technique", defaultUnit: "kg", density: 1.40, defaultPricePerKg: 500.0 },
  { id: "ptfe",         code: "PTFE",     label: "PTFE (Téflon)",          category: "plastique_technique", defaultUnit: "kg", density: 2.18, defaultPricePerKg: 60.0 },
  { id: "pehd",         code: "PEHD",     label: "Polyéthylène HD",        category: "plastique_technique", defaultUnit: "kg", density: 0.95, defaultPricePerKg: 6.0 },
  { id: "pebd",         code: "PEBD",     label: "Polyéthylène BD",        category: "plastique_technique", defaultUnit: "kg", density: 0.92, defaultPricePerKg: 6.0 },
  { id: "uhmwpe",       code: "UHMWPE",   label: "UHMW-PE",                category: "plastique_technique", defaultUnit: "kg", density: 0.94, defaultPricePerKg: 25.0 },
  { id: "pp",           code: "PP",       label: "Polypropylène",          category: "plastique_technique", defaultUnit: "kg", density: 0.91, defaultPricePerKg: 5.0 },
  { id: "pvc",          code: "PVC",      label: "PVC rigide",             category: "plastique_technique", defaultUnit: "kg", density: 1.40, defaultPricePerKg: 7.0 },
  { id: "pc",           code: "PC",       label: "Polycarbonate",          category: "plastique_technique", defaultUnit: "kg", density: 1.20, defaultPricePerKg: 20.0 },
  { id: "abs",          code: "ABS",      label: "ABS",                    category: "plastique_technique", defaultUnit: "kg", density: 1.05, defaultPricePerKg: 12.0 },
  { id: "petp",         code: "PETP",     label: "PET-P",                  category: "plastique_technique", defaultUnit: "kg", density: 1.38, defaultPricePerKg: 22.0 },
  { id: "psu",          code: "PSU",      label: "Polysulfone",            category: "plastique_technique", defaultUnit: "kg", density: 1.24, defaultPricePerKg: 90.0 },
  { id: "pei",          code: "PEI",      label: "Polyétherimide (Ultem)", category: "plastique_technique", defaultUnit: "kg", density: 1.27, defaultPricePerKg: 250.0 },
  { id: "pai",          code: "PAI",      label: "Polyamide-imide (Torlon)", category: "plastique_technique", defaultUnit: "kg", density: 1.42, defaultPricePerKg: 350.0 },
  { id: "pvdf",         code: "PVDF",     label: "PVDF",                   category: "plastique_technique", defaultUnit: "kg", density: 1.78, defaultPricePerKg: 90.0 },
  { id: "pom_gf30",     code: "POM-GF30", label: "POM renforcé GV 30%",   category: "plastique_technique", defaultUnit: "kg", density: 1.55, defaultPricePerKg: 35.0 },
  { id: "pa66_gf30",    code: "PA66-GF30",label: "PA66 renforcé GV 30%",  category: "plastique_technique", defaultUnit: "kg", density: 1.35, defaultPricePerKg: 35.0 },

  // ═══ Élastomères ══════════════════════════════════════════════════
  { id: "nbr",          code: "NBR",      label: "Nitrile (NBR)",         category: "elastomere", defaultUnit: "kg", density: 1.20, defaultPricePerKg: 15.0 },
  { id: "epdm",         code: "EPDM",     label: "EPDM",                  category: "elastomere", defaultUnit: "kg", density: 1.10, defaultPricePerKg: 14.0 },
  { id: "vmq",          code: "VMQ",      label: "Silicone (VMQ)",        category: "elastomere", defaultUnit: "kg", density: 1.20, defaultPricePerKg: 35.0 },
  { id: "cr",           code: "CR",       label: "Néoprène (CR)",         category: "elastomere", defaultUnit: "kg", density: 1.25, defaultPricePerKg: 25.0 },
  { id: "pu",           code: "PU",       label: "Polyuréthane",          category: "elastomere", defaultUnit: "kg", density: 1.15, defaultPricePerKg: 22.0 },
  { id: "fkm",          code: "FKM",      label: "Viton (FKM)",           category: "elastomere", defaultUnit: "kg", density: 1.85, defaultPricePerKg: 200.0 },
  { id: "sbr",          code: "SBR",      label: "SBR",                   category: "elastomere", defaultUnit: "kg", density: 1.10, defaultPricePerKg: 10.0 },
  { id: "nr",           code: "NR",       label: "Caoutchouc naturel",    category: "elastomere", defaultUnit: "kg", density: 1.00, defaultPricePerKg: 8.0 },

  // ═══ Composites ═══════════════════════════════════════════════════
  { id: "comp_cf_ep",   code: "CF/EP",    label: "Carbone / Époxy",      category: "composite", defaultUnit: "kg", density: 1.55, defaultPricePerKg: 120.0 },
  { id: "comp_gf_ep",   code: "GF/EP",    label: "Verre / Époxy",        category: "composite", defaultUnit: "kg", density: 1.90, defaultPricePerKg: 25.0 },
  { id: "comp_gf_pa",   code: "GF/PA",    label: "Verre / Polyamide",    category: "composite", defaultUnit: "kg", density: 1.35, defaultPricePerKg: 30.0 },
  { id: "comp_kevlar_ep",code:"KF/EP",    label: "Kevlar / Époxy",       category: "composite", defaultUnit: "kg", density: 1.35, defaultPricePerKg: 200.0 },
  { id: "comp_sandwich_nid",code:"Sandwich-Nid",label: "Sandwich nid d'abeille", category: "composite", defaultUnit: "m2", density: 0.05, defaultPricePerKg: 0 },
  { id: "comp_sandwich_mousse",code:"Sandwich-Mousse",label: "Sandwich mousse PVC/PU", category: "composite", defaultUnit: "m2", density: 0.08, defaultPricePerKg: 0 },

  // ═══ Céramiques techniques ════════════════════════════════════════
  { id: "cer_al2o3",    code: "Al2O3",    label: "Alumine (Al2O3)",      category: "ceramique", defaultUnit: "kg", density: 3.90, defaultPricePerKg: 80.0 },
  { id: "cer_zro2",     code: "ZrO2",     label: "Zircone (ZrO2)",       category: "ceramique", defaultUnit: "kg", density: 6.05, defaultPricePerKg: 120.0 },
  { id: "cer_si3n4",    code: "Si3N4",    label: "Nitrure de silicium",  category: "ceramique", defaultUnit: "kg", density: 3.20, defaultPricePerKg: 200.0 },
  { id: "cer_sic",      code: "SiC",      label: "Carbure de silicium",  category: "ceramique", defaultUnit: "kg", density: 3.10, defaultPricePerKg: 150.0 },
  { id: "cer_macor",    code: "Macor",    label: "Macor (usinable)",     category: "ceramique", defaultUnit: "kg", density: 2.52, defaultPricePerKg: 800.0 },

  // ═══ Bois & divers ════════════════════════════════════════════════
  { id: "mdf",          code: "MDF",      label: "MDF (panneau)",        category: "bois_divers", defaultUnit: "m2", density: 0.75, defaultPricePerKg: 4.0 },
  { id: "contreplaque", code: "CTP",      label: "Contreplaqué",         category: "bois_divers", defaultUnit: "m2", density: 0.60, defaultPricePerKg: 6.0 },
  { id: "balsa",        code: "Balsa",    label: "Bois de balsa",        category: "bois_divers", defaultUnit: "m3", density: 0.15, defaultPricePerKg: 30.0 },
  { id: "mousse_pu",    code: "MoussePU", label: "Mousse polyuréthane",  category: "bois_divers", defaultUnit: "m2", density: 0.04, defaultPricePerKg: 0 },
  { id: "mousse_pe",    code: "MoussePE", label: "Mousse polyéthylène",  category: "bois_divers", defaultUnit: "m2", density: 0.03, defaultPricePerKg: 0 },
  { id: "graphite",     code: "Graphite", label: "Graphite",             category: "bois_divers", defaultUnit: "kg", density: 2.25, defaultPricePerKg: 60.0 },
  { id: "verre_borosilicate",code:"Boro", label: "Verre borosilicate",   category: "bois_divers", defaultUnit: "m2", density: 2.23, defaultPricePerKg: 15.0 },
  { id: "verre_trempe", code: "VerreTrempe", label: "Verre trempé",      category: "bois_divers", defaultUnit: "m2", density: 2.50, defaultPricePerKg: 12.0 },

  // ═══ Consommables ═════════════════════════════════════════════════
  { id: "huile_coupe",  code: "HC",       label: "Huile de coupe",       category: "bois_divers", defaultUnit: "L", density: 0.90, defaultPricePerKg: 15.0 },
  { id: "fluide_coupe", code: "FC",       label: "Fluide de coupe",      category: "bois_divers", defaultUnit: "L", density: 1.00, defaultPricePerKg: 12.0 },
  { id: "graisse",      code: "GR",       label: "Graisse mécanique",    category: "bois_divers", defaultUnit: "kg", density: 0.90, defaultPricePerKg: 20.0 },
  { id: "peinture",     code: "PEIN",     label: "Peinture industrielle",category: "bois_divers", defaultUnit: "L", density: 1.20, defaultPricePerKg: 25.0 },
  { id: "vernis",       code: "VERN",     label: "Vernis",               category: "bois_divers", defaultUnit: "L", density: 0.95, defaultPricePerKg: 30.0 },
  { id: "degraissant",  code: "DEG",      label: "Dégraissant",          category: "bois_divers", defaultUnit: "L", density: 0.85, defaultPricePerKg: 10.0 },
];

// ----------------------------------------------------------------------------
// Formes d'approvisionnement
// ----------------------------------------------------------------------------
export type MaterialShape =
  | "barre_ronde" | "barre_carree" | "barre_hexagonale" | "barre_rectangulaire"
  | "tole" | "plaque"
  | "tube_rond" | "tube_carre" | "tube_rectangulaire"
  | "profil_l" | "profil_u" | "profil_t" | "profil_i"
  | "fil" | "fil_machine" | "poudre"
  | "forge" | "moule" | "coulee" | "billette";

export const MATERIAL_SHAPES: { key: MaterialShape; label: string }[] = [
  { key: "barre_ronde",        label: "Barre ronde" },
  { key: "barre_carree",       label: "Barre carrée" },
  { key: "barre_hexagonale",   label: "Barre hexagonale" },
  { key: "barre_rectangulaire",label: "Barre rectangulaire" },
  { key: "tole",               label: "Tôle" },
  { key: "plaque",             label: "Plaque" },
  { key: "tube_rond",          label: "Tube rond" },
  { key: "tube_carre",         label: "Tube carré" },
  { key: "tube_rectangulaire", label: "Tube rectangulaire" },
  { key: "profil_l",           label: "Profilé en L" },
  { key: "profil_u",           label: "Profilé en U" },
  { key: "profil_t",           label: "Profilé en T" },
  { key: "profil_i",           label: "Profilé en I" },
  { key: "fil",                label: "Fil" },
  { key: "fil_machine",        label: "Fil machine" },
  { key: "poudre",             label: "Poudre (frittage)" },
  { key: "forge",              label: "Pièce forgée" },
  { key: "moule",              label: "Pièce moulée" },
  { key: "coulee",             label: "Pièce coulée" },
  { key: "billette",           label: "Billette / Bloom" },
];

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
export function getMaterialsByCategory(cat: MaterialCategory): Material[] {
  return MATERIALS.filter((m) => m.category === cat);
}

export function findMaterial(id: string): Material | undefined {
  return MATERIALS.find((m) => m.id === id);
}

export function searchMaterials(query: string): Material[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return MATERIALS.filter(
    (m) =>
      m.label.toLowerCase().includes(q) ||
      m.code.toLowerCase().includes(q),
  );
}