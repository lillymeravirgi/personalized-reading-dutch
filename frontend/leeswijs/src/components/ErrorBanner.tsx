import { AlertCircle } from "lucide-react";

type ErrorBannerProps = {
  message: string;
  title?: string;
  className?: string;
};

export default function ErrorBanner({ message, title, className = "" }: ErrorBannerProps) {
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 ${className}`}>
      <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
      <div>
        {title && (
          <h2 className="font-heading text-sm font-semibold text-red-700">
            {title}
          </h2>
        )}
        <p className="text-sm font-body text-red-700">{message}</p>
      </div>
    </div>
  );
}
