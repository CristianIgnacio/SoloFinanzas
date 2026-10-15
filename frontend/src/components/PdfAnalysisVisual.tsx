import { PdfIcon } from "./icons";
import "./PdfAnalysisVisual.css";

type Props = {
  analyzing: boolean;
  hasFile: boolean;
};

export function PdfAnalysisVisual({ analyzing, hasFile }: Props) {
  return (
    <div className="rounded-2xl border border-primary/10 bg-primary-mist/40 px-4 py-3 sm:py-4">
      <div aria-hidden="true" className={`pdf-analysis-scene ${analyzing ? "pdf-analysis-active" : ""}`}>
        <div className="pdf-analysis-sheet">
          <PdfIcon className="mb-3 h-5 w-5 text-primary" />
          <div className="pdf-analysis-line w-10" />
          <div className="pdf-analysis-line w-full" />
          <div className="pdf-analysis-line w-4/5" />
          <div className="pdf-analysis-line mt-3 w-full" />
          <div className="pdf-analysis-line w-3/5" />
          {analyzing ? <div className="pdf-analysis-scan" /> : null}
        </div>
        <div className="pdf-analysis-connection" />
        {analyzing ? [0, 1, 2].map(index => (
          <span key={index} className="pdf-analysis-fragment" style={{ animationDelay: `${index * 0.55}s` }} />
        )) : null}
        <div className="pdf-analysis-data">
          {["Fecha", "Monto", "Categoría"].map((label, index) => (
            <div key={label} className="pdf-analysis-row" style={{ animationDelay: `${index * 0.55}s` }}>
              <span className="h-2 w-2 rounded-full bg-primary/40" />
              <span>{label}</span>
              <span className="ml-auto h-1.5 w-5 rounded-full bg-primary/15" />
            </div>
          ))}
        </div>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" className="text-center">
        <p className="text-sm font-semibold text-primary">
          {analyzing ? "Analizando tu cartola" : hasFile ? "Documento listo para analizar" : "Del PDF a tus movimientos"}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted">
          {analyzing ? "Extrayendo datos y preparando los movimientos para tu revisión." : "Revisa y organiza los datos antes de guardarlos."}
        </p>
      </div>
    </div>
  );
}
