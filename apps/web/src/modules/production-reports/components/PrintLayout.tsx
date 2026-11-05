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
      {/* CSS للطباعة */}
<style>{`
  @media print {
    /* 1. إخفاء كل شيء في الصفحة */
    body * {
      visibility: hidden !important;
    }
    
    /* 2. إظهار التقرير فقط */
    #print-report-content, #print-report-content * {
      visibility: visible !important;
    }
    
    /* 3. تثبيت التقرير في أعلى الصفحة */
    #print-report-content {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: white !important;
      color: black !important;
      z-index: 9999 !important;
    }
    
    /* 4. تجاوز قواعد Dark Mode */
    #print-report-content .bg-white,
    #print-report-content .bg-slate-50,
    #print-report-content .bg-slate-100 {
      background-color: white !important;
    }
    #print-report-content .text-slate-900,
    #print-report-content .text-slate-800,
    #print-report-content .text-slate-700 {
      color: black !important;
    }
    #print-report-content .text-slate-500,
    #print-report-content .text-slate-400 {
      color: #666 !important;
    }
    #print-report-content .border-slate-200,
    #print-report-content .border-slate-300 {
      border-color: #ddd !important;
    }
    
    /* 5. منع قطع الجداول */
    #print-report-content table {
      page-break-inside: auto !important;
      break-inside: auto !important;
    }
    #print-report-content tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    #print-report-content thead {
      display: table-header-group !important;
    }
    #print-report-content h2 {
      page-break-after: avoid !important;
      break-after: avoid !important;
    }
    
    /* 6. إخفاء الأزرار */
    .print-hidden, button, .print\\:hidden {
      display: none !important;
    }
    
    /* 7. إعدادات الصفحة */
    @page {
      size: A4;
      margin: 10mm;
    }
  }
`}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden">
        <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
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

          <div className="overflow-y-auto p-8">
            <ReportContent
              title={title}
              subtitle={subtitle}
              logoUrl={logoUrl}
              companyName={companyName}
              printDate={printDate}
            >
              {children}
            </ReportContent>
          </div>
        </div>
      </div>

      <div className="hidden print:block" id="print-report-content">
        <ReportContent
          title={title}
          subtitle={subtitle}
          logoUrl={logoUrl}
          companyName={companyName}
          printDate={printDate}
        >
          {children}
        </ReportContent>
      </div>
    </>
  );
}

function ReportContent({
  title,
  subtitle,
  logoUrl,
  companyName,
  printDate,
  children,
}: {
  title: string;
  subtitle?: string;
  logoUrl?: string | null;
  companyName?: string;
  printDate: string;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* ✅ رأس التقرير: الشعار يسار، التاريخ يمين، العنوان في المنتصف */}
      <div className="mb-6 border-b-2 border-slate-800 pb-4">
        <div className="flex items-start justify-between">
          {/* الشعار (يسار) */}
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt="Logo" 
                style={{
                  width: '80px',
                  height: '80px',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-200 text-xs font-bold text-slate-500">
                Logo
              </div>
            )}
            <div>
              <div className="text-lg font-extrabold text-slate-800">
                {companyName ?? "AniXOS"}
              </div>
            </div>
          </div>

          {/* التاريخ (يمين) */}
          <div className="text-end text-xs text-slate-500">
            <div>Édité le : {printDate}</div>
            <div className="mt-1 font-mono text-[10px]">{`Réf: ${Math.random().toString(36).substring(2, 8).toUpperCase()}`}</div>
          </div>
        </div>

        {/* العنوان الرئيسي في المنتصف */}
        <div className="mt-4 text-center">
          <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900">
            Rapport de Production
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
          )}
        </div>
      </div>

      {/* محتوى التقرير */}
      {children}

      {/* تذييل التقرير */}
      <div className="mt-8 border-t border-slate-300 pt-4 text-center text-[10px] text-slate-400">
        <p>Document généré par AniXOS — {new Date().getFullYear()}</p>
        <p className="mt-0.5">Ce document est confidentiel et destiné à un usage interne.</p>
      </div>
    </>
  );
}
