import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Cloud,
  ShieldCheck,
  Settings,
  Zap,
  Headphones,
  Monitor,
  UserCog,
  FolderKanban,
  BarChart3,
  Boxes,
  Building2,
  Check,
  ArrowRight,
  Play,
  Gift,
  QrCode,
} from "lucide-react";
import { AppLogo } from "../../../shared/components/AppLogo";
import { supabase } from "../../../lib/supabaseClient";
import { BillingToggle, type BillingCycle } from "../../subscription/components/BillingToggle";
import { PlanCard, PLAN_ICONS, type PlanDefinition } from "../../subscription/components/PlanCard";

interface LandingPageProps {
  onLogin: () => void;
  onCreateAccount: () => void;
  onPlanning: () => void;
}

interface PlatformSettings {
  currency: string;
  trial_days: number;
  standard_monthly_price: number;
  standard_yearly_price: number;
  premium_monthly_price: number;
  premium_yearly_price: number;
  standard_max_databases: number;
  standard_max_staff: number;
  premium_max_databases: number;
  premium_max_staff: number;
}

/**
 * Page d'accueil publique d'AniXOS.
 * Affichée à la racine "/" quand aucune session ni device mode n'existe.
 * Les tarifs sont chargés dynamiquement depuis `platform_settings` (RPC
 * `get_platform_settings`) — même source que la page Subscription.
 */
export function LandingPage({ onLogin, onCreateAccount, onPlanning }: LandingPageProps) {
  const { t, i18n } = useTranslation();

  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const [pricingLoading, setPricingLoading] = useState(true);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings | null>(null);

  const isRtl = i18n.language === "ar";

  // Charge les paramètres de tarification (même RPC que SubscriptionPage)
  useEffect(() => {
    let isMounted = true;
    void (async () => {
      const { data } = await supabase.rpc("get_platform_settings");
      if (isMounted) {
        if (data && data.length > 0) {
          setPlatformSettings(data[0] as PlatformSettings);
        }
        setPricingLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const currency = platformSettings?.currency ?? "TND";

  const plans: PlanDefinition[] = platformSettings
    ? [
        {
          id: "trial",
          name: t("subscription.planTrial"),
          icon: PLAN_ICONS.trial,
          iconBg: "bg-slate-100 text-slate-600",
          priceMonthly: 0,
          priceYearly: 0,
          ctaLabel: t("landing.pricing.choosePlan", { defaultValue: "Choisir ce plan" }),
          onCta: onCreateAccount,
          features: [
            { label: t("subscription.featuresMaxDatabases", { count: 1 }), included: true },
            { label: t("subscription.featuresMaxStaff", { count: 10 }), included: true },
            { label: t("subscription.featuresPwaWorker"), included: true },
            { label: t("subscription.featuresEmailSupport"), included: false },
            { label: t("subscription.featuresQRCode"), included: false },
            { label: t("subscription.featuresExportImport"), included: false },
          ],
        },
        {
          id: "standard",
          name: t("subscription.planStandard"),
          icon: PLAN_ICONS.standard,
          iconBg: "bg-indigo-100 text-indigo-600",
          priceMonthly: platformSettings.standard_monthly_price,
          priceYearly: platformSettings.standard_yearly_price,
          isPopular: true,
          ctaLabel: t("landing.pricing.choosePlan", { defaultValue: "Choisir ce plan" }),
          onCta: onCreateAccount,
          features: [
            {
              label: t("subscription.featuresMaxDatabases", {
                count: platformSettings.standard_max_databases,
              }),
              included: true,
              highlight: true,
            },
            {
              label: t("subscription.featuresMaxStaff", {
                count: platformSettings.standard_max_staff,
              }),
              included: true,
            },
            { label: t("subscription.featuresPwaWorker"), included: true },
            { label: t("subscription.featuresEmailSupport"), included: true },
            { label: t("subscription.featuresQRCode"), included: false },
            { label: t("subscription.featuresExportImport"), included: true },
          ],
        },
        {
          id: "premium",
          name: t("subscription.planPremium"),
          icon: PLAN_ICONS.premium,
          iconBg: "bg-amber-100 text-amber-600",
          priceMonthly: platformSettings.premium_monthly_price,
          priceYearly: platformSettings.premium_yearly_price,
          ctaLabel: t("landing.pricing.choosePlan", { defaultValue: "Choisir ce plan" }),
          onCta: onCreateAccount,
          features: [
            {
              label: t("subscription.featuresMaxDatabases", {
                count: platformSettings.premium_max_databases,
              }),
              included: true,
              highlight: true,
            },
            {
              label: t("subscription.featuresMaxStaff", {
                count: platformSettings.premium_max_staff,
              }),
              included: true,
            },
            { label: t("subscription.featuresPwaWorker"), included: true },
            { label: t("subscription.featuresPrioritySupport"), included: true },
            { label: t("subscription.featuresQRCode"), included: true, highlight: true },
            { label: t("subscription.featuresExportImport"), included: true },
          ],
        },
      ]
    : [];

  return (
    <div className="min-h-screen bg-white text-slate-800" dir={isRtl ? "rtl" : "ltr"}>
      {/* ==================== HEADER ==================== */}
      <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <AppLogo className="h-9 w-auto" />

            <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-600 lg:flex">
              <a href="#accueil" className="border-b-2 border-orange-500 pb-0.5 text-orange-600">
                {t("landing.nav.home", { defaultValue: "Accueil" })}
              </a>
              <a href="#fonctionnalites" className="hover:text-slate-900">
                {t("landing.nav.features", { defaultValue: "Fonctionnalités" })}
              </a>
              <a href="#tarifs" className="hover:text-slate-900">
                {t("landing.nav.pricing", { defaultValue: "Tarifs" })}
              </a>
              <a href="#apropos" className="hover:text-slate-900">
                {t("landing.nav.about", { defaultValue: "À propos" })}
              </a>
              <a href="#contact" className="hover:text-slate-900">
                {t("landing.nav.contact", { defaultValue: "Contact" })}
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onPlanning}
              title={t("landing.nav.planning", { defaultValue: "Suivi Planning" })}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 sm:px-3"
            >
              <QrCode size={14} />
              {/* Sur mobile : mot court. Sur desktop : texte complet. */}
              <span className="sm:hidden">
                {t("landing.nav.planningShort", { defaultValue: "Planning" })}
              </span>
              <span className="hidden sm:inline">
                {t("landing.nav.planning", { defaultValue: "Suivi Planning" })}
              </span>
            </button>
            <button
              type="button"
              onClick={onLogin}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900 sm:px-4"
            >
              {t("landing.nav.login", { defaultValue: "Connexion" })}
            </button>
            <button
              type="button"
              onClick={onCreateAccount}
              className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white shadow-md shadow-orange-200 transition hover:bg-orange-600 sm:px-5"
            >
              {t("landing.nav.trial", { defaultValue: "Essai gratuit" })}
            </button>
          </div>
        </div>
      </header>

      {/* ==================== HERO ==================== */}
      <section id="accueil" className="relative isolate overflow-hidden bg-slate-900">
        <HeroBackground />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/70 to-transparent" />

        <div className="relative mx-auto flex min-h-[560px] max-w-7xl items-center px-4 py-16 sm:px-6 lg:min-h-[680px] lg:px-8 lg:py-24">
          <div className="max-w-xl text-white">
            <p className="mb-5 text-xs font-black uppercase tracking-[0.18em] text-orange-400">
              {t("landing.hero.tagline", {
                defaultValue: "La plateforme cloud pour l'industrie mécanique",
              })}
            </p>

            <h1 className="mb-6 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.75rem]">
              {t("landing.hero.title1", { defaultValue: "Gérez votre production CNC" })}{" "}
              <br />
              {t("landing.hero.title2", { defaultValue: "plus simplement avec" })}{" "}
              <span>
                <span className="text-white">Ani</span>
                <span className="text-orange-500">XOS</span>
              </span>
            </h1>

            <p className="mb-8 max-w-lg text-base text-slate-300 sm:text-lg">
              {t("landing.hero.subtitle", {
                defaultValue:
                  "Une solution complète pour les entreprises de fabrication de pièces mécaniques, basée sur des machines CNC. Suivez, organisez et optimisez toute votre production depuis une seule plateforme cloud.",
              })}
            </p>

            <div className="mb-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onCreateAccount}
                className="group inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-500/30 transition hover:bg-orange-600"
              >
                {t("landing.hero.ctaPrimary", { defaultValue: "Commencer maintenant" })}
                <ArrowRight
                  size={16}
                  className={`transition ${
                    isRtl ? "rotate-180 group-hover:-translate-x-1" : "group-hover:translate-x-1"
                  }`}
                />
              </button>
              <a
                href="#video"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/10"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                  <Play size={11} fill="currentColor" />
                </span>
                {t("landing.hero.ctaSecondary", { defaultValue: "Voir la vidéo" })}
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <Gift size={14} className="text-orange-400" />
                {t("landing.hero.trialBadge", { defaultValue: "Essai gratuit pendant 14 jours" })}
              </span>
              <span className="text-slate-500">•</span>
              <span>
                {t("landing.hero.noCard", { defaultValue: "Aucune carte bancaire requise" })}
              </span>
            </div>
          </div>

          {/* Badge "Fini les papiers !" */}
          <div
            className={`pointer-events-none absolute top-24 ${
              isRtl ? "left-1/4" : "right-1/4"
            } rotate-6 rounded-lg bg-white px-3 py-1.5 text-xs font-black text-slate-800 shadow-xl`}
          >
            {t("landing.hero.sticker", { defaultValue: "Fini les papiers !" })}
          </div>
        </div>
      </section>

      {/* ==================== AVANTAGES ==================== */}
      <section className="border-b border-slate-100 bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-5 lg:px-8">
          <AdvantageItem
            icon={<Cloud size={22} />}
            title={t("landing.advantages.cloud", { defaultValue: "100% Cloud" })}
            body={t("landing.advantages.cloudDesc", {
              defaultValue: "Accédez à vos données de n'importe où, sur tous vos appareils.",
            })}
          />
          <AdvantageItem
            icon={<ShieldCheck size={22} />}
            title={t("landing.advantages.secure", { defaultValue: "Sécurisé" })}
            body={t("landing.advantages.secureDesc", {
              defaultValue: "Vos données sont protégées avec les meilleurs standards.",
            })}
          />
          <AdvantageItem
            icon={<Settings size={22} />}
            title={t("landing.advantages.simple", { defaultValue: "Simple à utiliser" })}
            body={t("landing.advantages.simpleDesc", {
              defaultValue: "Une interface intuitive pour les équipes de production.",
            })}
          />
          <AdvantageItem
            icon={<Zap size={22} />}
            title={t("landing.advantages.gain", { defaultValue: "Gain de productivité" })}
            body={t("landing.advantages.gainDesc", {
              defaultValue: "Moins de temps perdu, plus de résultats.",
            })}
          />
          <AdvantageItem
            icon={<Headphones size={22} />}
            title={t("landing.advantages.support", { defaultValue: "Support réactif" })}
            body={t("landing.advantages.supportDesc", {
              defaultValue: "Notre équipe vous accompagne à chaque étape.",
            })}
          />
        </div>
      </section>

      {/* ==================== SOLUTION COMPLÈTE ==================== */}
      <section id="fonctionnalites" className="bg-slate-50">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_2fr] lg:gap-16 lg:px-8 lg:py-24">
          <div>
            <p className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-orange-500">
              {t("landing.solution.tagline", { defaultValue: "Tout ce dont vous avez besoin" })}
            </p>
            <h2 className="mb-5 text-3xl font-black leading-tight tracking-tight text-slate-900 sm:text-4xl">
              {t("landing.solution.title", {
                defaultValue: "Une solution complète pour votre atelier",
              })}
            </h2>
            <p className="mb-6 text-sm text-slate-500">
              {t("landing.solution.subtitle", {
                defaultValue:
                  "AniXOS centralise tous vos processus de production pour une gestion plus efficace et plus rentable de votre activité.",
              })}
            </p>

            <ul className="space-y-3 text-sm font-semibold text-slate-700">
              {[
                t("landing.solution.bullet1", { defaultValue: "Suivi des temps et des projets" }),
                t("landing.solution.bullet2", { defaultValue: "Gestion des machines et des opérateurs" }),
                t("landing.solution.bullet3", { defaultValue: "Rapports et analyses détaillées" }),
                t("landing.solution.bullet4", {
                  defaultValue: "Accès multi-utilisateurs avec des rôles personnalisés",
                }),
                t("landing.solution.bullet5", { defaultValue: "Intégration facile et évolutive" }),
              ].map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <Check size={16} className="mt-0.5 shrink-0 text-orange-500" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              {t("landing.solution.cta", { defaultValue: "Découvrir toutes les fonctionnalités" })}
              <ArrowRight size={14} className={isRtl ? "rotate-180" : ""} />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<Monitor size={22} />}
              title={t("landing.features.machines", { defaultValue: "Gestion des machines CNC" })}
              body={t("landing.features.machinesDesc", {
                defaultValue: "Suivi en temps réel : états, maintenance et disponibilité.",
              })}
            />
            <FeatureCard
              icon={<UserCog size={22} />}
              title={t("landing.features.workers", { defaultValue: "Suivi des opérateurs" })}
              body={t("landing.features.workersDesc", {
                defaultValue: "Temps de travail, productivité, évaluation des performances.",
              })}
            />
            <FeatureCard
              icon={<FolderKanban size={22} />}
              title={t("landing.features.projects", { defaultValue: "Gestion des projets" })}
              body={t("landing.features.projectsDesc", {
                defaultValue: "De la planification à la livraison, tout est sous contrôle.",
              })}
            />
            <FeatureCard
              icon={<BarChart3 size={22} />}
              title={t("landing.features.reports", { defaultValue: "Rapports & Analyses" })}
              body={t("landing.features.reportsDesc", {
                defaultValue: "Des données fiables pour mieux décider.",
              })}
            />
            <FeatureCard
              icon={<Boxes size={22} />}
              title={t("landing.features.stock", { defaultValue: "Stock & Outillages" })}
              body={t("landing.features.stockDesc", {
                defaultValue: "Gérez vos outils et consommables en toute simplicité.",
              })}
            />
            <FeatureCard
              icon={<Building2 size={22} />}
              title={t("landing.features.multiSite", { defaultValue: "Accès multi-sites" })}
              body={t("landing.features.multiSiteDesc", {
                defaultValue: "Vos équipes connectées, partout et tout le temps.",
              })}
            />
          </div>
        </div>
      </section>

      {/* ==================== TARIFS ==================== */}
      <section id="tarifs" className="bg-slate-900 text-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="mb-10 grid items-end gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-orange-400">
                {t("landing.pricing.tagline", { defaultValue: "Nos offres" })}
              </p>
              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
                {t("landing.pricing.title", {
                  defaultValue: "Choisissez le plan qui vous correspond",
                })}
              </h2>
              <p className="mt-3 max-w-lg text-sm text-slate-300">
                {t("landing.pricing.subtitle", {
                  defaultValue:
                    "Des formules flexibles adaptées à la taille de votre entreprise et à vos besoins.",
                })}
              </p>
            </div>

            <div className="flex items-center justify-end">
              <BillingToggle value={billing} onChange={setBilling} />
            </div>
          </div>

          {pricingLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-400">
              {t("common.loading")}
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-3">
              {plans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} billing={billing} currency={currency} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ==================== STATS + CTA ==================== */}
      <section className="bg-slate-950 text-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:px-8">
          <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-3 lg:w-auto lg:gap-12">
            <StatItem
              value="+500"
              label={t("landing.stats.companies", { defaultValue: "Entreprises nous font confiance" })}
            />
            <StatItem
              value="+1 200"
              label={t("landing.stats.machines", { defaultValue: "Machines connectées" })}
            />
            <StatItem
              value="+98%"
              label={t("landing.stats.satisfaction", { defaultValue: "Satisfaction client" })}
            />
          </div>

          <button
            type="button"
            onClick={onCreateAccount}
            className="group inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-500/30 transition hover:bg-orange-600"
          >
            {t("landing.stats.cta", { defaultValue: "Essayer gratuitement" })}
            <ArrowRight
              size={16}
              className={`transition ${isRtl ? "rotate-180" : "group-hover:translate-x-1"}`}
            />
          </button>
        </div>
      </section>

      {/* ==================== FOOTER ==================== */}
      <footer className="border-t border-slate-800 bg-slate-950 py-8 text-slate-400">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <AppLogo className="h-7 w-auto" />
            <span className="text-xs font-semibold">
              {t("landing.footer.tagline", { defaultValue: "Votre production, notre mission." })}
            </span>
          </div>
          <p className="text-xs">
            {t("landing.footer.copyright", {
              defaultValue: "AniXOS © {{year}} — Tous droits réservés",
              year: new Date().getFullYear(),
            })}
          </p>
        </div>
      </footer>
    </div>
  );
}

// ============================================================
// Sous-composants
// ============================================================

function AdvantageItem({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
        {icon}
      </div>
      <div>
        <div className="text-sm font-black text-slate-800">{title}</div>
        <div className="mt-0.5 text-xs text-slate-500">{body}</div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-orange-200 hover:shadow-md">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
        {icon}
      </div>
      <div className="mb-1.5 text-sm font-black text-slate-800">{title}</div>
      <div className="text-xs text-slate-500">{body}</div>
    </div>
  );
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center lg:text-start">
      <div className="text-2xl font-black text-orange-500 sm:text-3xl">{value}</div>
      <div className="mt-0.5 text-xs text-slate-400">{label}</div>
    </div>
  );
}

// ============================================================
// HeroBackground — Fait défiler les images de fond du Hero
// ============================================================
//
// AJOUTER UNE IMAGE :
//   1. Placez le fichier dans : apps/web/public/images/
//   2. Ajoutez un objet { src, alt } dans le tableau ci-dessous.
//   3. C'est tout !
//
// La rotation automatique est de 6 secondes. Si une seule image est
// présente, aucune rotation ne se produit.

const HERO_IMAGES = [
  {
    src: "/images/hero-main.png",
    alt: "AniXOS — La plateforme cloud pour l'industrie mécanique",
  },
  // Ajoutez d'autres images ici (exemple) :
  // {
  //   src: "/images/hero-2.png",
  //   alt: "Opérateur CNC dans un atelier moderne",
  // },
  // {
  //   src: "/images/hero-3.png",
  //   alt: "Machine CNC de précision",
  // },
];

const HERO_ROTATION_MS = 6000; // Durée entre deux images (ms)

function HeroBackground() {
  const [current, setCurrent] = useState(0);
  const hasMultiple = HERO_IMAGES.length > 1;

  useEffect(() => {
    if (!hasMultiple) return;
    const timer = setInterval(() => {
      setCurrent((c) => (c + 1) % HERO_IMAGES.length);
    }, HERO_ROTATION_MS);
    return () => clearInterval(timer);
  }, [hasMultiple]);

  return (
    <>
      {HERO_IMAGES.map((img, idx) => (
        <img
          key={img.src}
          src={img.src}
          alt={img.alt}
          loading={idx === 0 ? "eager" : "lazy"}
          className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-[1500ms] ease-in-out ${
            idx === current ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      {hasMultiple && (
        <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 gap-2">
          {HERO_IMAGES.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrent(idx)}
              aria-label={`Image ${idx + 1}`}
              className={`h-2 rounded-full transition-all ${
                idx === current ? "w-8 bg-orange-500" : "w-2 bg-white/40 hover:bg-white/70"
              }`}
            />
          ))}
        </div>
      )}
    </>
  );
}