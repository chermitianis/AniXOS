import { Printer, X } from "lucide-react";

interface PrintLayoutProps {
  title: string;
  subtitle?: string;
  logoUrl?: string | null;
  companyName?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function PrintLayout({
  title,
  subtitle,
  logoUrl,
  companyName,
  onClose,
  children,
}: PrintLayoutProps) {
  const printDate = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      {/* ✅ CSS للطباعة: إخفاء كل شيء ما عدا التقرير */}
      <style>{`
        @media print {
          /* إخفاء كل شيء */
          body * {
            visibility: hidden;
          }
          /* إظهار محتوى التقرير فقط */
          #print-report-content, #print-report-content * {
            visibility: visible;
          }
          /* تثبيت التقرير في أعلى الصفحة */
          #print-report-content {
            position: static;
            width: 100%;
            margin: 0;
            padding: 0;
          }
          /* إخفاء أي عناصر أخرى (مثل الـ modals) */
          .print-hidden {
            display: none !important;
          }
          @page {
            size: A4;
            margin: 15mm;
          }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:static print:block print:bg-transparent print:p-0 print:inset-auto">
        <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl print:max-h-none print:w-full print:max-w-none print:overflow-visible print:rounded-none print:shadow-none print:relative">
          {/* أزرار التحكم (مخفية عند الطباعة) */}
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 print:hidden">
            <div className="text-sm font-bold text-slate-700">Aperçu du rapport</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-indigo-700"
              >
                <Printer size={14} /> Imprimer / PDF
              </button>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* محتوى التقرير (الذي سيتم طباعته) */}
          <div className="overflow-y-auto p-8 print:overflow-visible print:p-0" id="print-report-content">
            {/* رأس التقرير */}
            <div className="mb-6 flex items-start justify-between border-b-2 border-slate-800 pb-4">
              <div className="flex items-center gap-4">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-16 w-16 object-contain" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-200 text-xs font-bold text-slate-500">
                    Logo
                  </div>
                )}
                <div>
                  <div className="text-lg font-extrabold text-slate-800">
                    {companyName ?? "AniXOS"}
                  </div>
                  <div className="text-xs text-slate-500">Rapport de production</div>
                </div>
              </div>
              <div className="text-end text-xs text-slate-500">
                <div>Édité le : {printDate}</div>
                <div className="mt-1 font-mono text-[10px]">{`Réf: ${Math.random().toString(36).substring(2, 8).toUpperCase()}`}</div>
              </div>
            </div>

            {/* عنوان التقرير */}
            <div className="mb-6">
              <h1 className="text-2xl font-black text-slate-900">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
            </div>

            {/* محتوى التقرير */}
            {children}

            {/* تذييل التقرير */}
            <div className="mt-8 border-t border-slate-300 pt-4 text-center text-[10px] text-slate-400">
              <p>Document généré par AniXOS — {new Date().getFullYear()}</p>
              <p className="mt-0.5">Ce document est confidentiel et destiné à un usage interne.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
