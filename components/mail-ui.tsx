import { Check, type LucideIcon } from 'lucide-react';

export const inputCls =
  'w-full px-3.5 py-2.5 bg-input-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/30 transition-colors';

export const textareaCls =
  'w-full px-3.5 py-3 bg-input-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/30 transition-colors resize-y font-mono leading-relaxed';

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  icon: Icon,
  readOnly,
  dir,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  icon?: LucideIcon;
  readOnly?: boolean;
  dir?: string;
}) {
  return (
    <div className="relative">
      {Icon && (
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
      )}
      <input
        type={type}
        dir={dir}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full ${Icon ? 'pl-9' : 'pl-3.5'} pr-3.5 py-2.5 bg-input-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/30 transition-colors ${readOnly ? 'opacity-80' : ''}`}
      />
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest font-mono">
          {label}
          {hint && <span className="ml-1 normal-case tracking-normal font-sans font-normal text-muted-foreground/80">{hint}</span>}
        </label>
      )}
      {children}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

export function Notice({
  variant = 'default',
  children,
}: {
  variant?: 'default' | 'success' | 'error' | 'warning';
  children: React.ReactNode;
}) {
  const styles = {
    default: 'border-foreground/20 bg-foreground/[0.03] text-foreground',
    success: 'border-green-200 bg-green-50 text-green-800',
    error: 'border-red-200 bg-red-50 text-red-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
  };
  return (
    <div className={`p-4 rounded-lg border text-sm ${styles[variant]}`}>{children}</div>
  );
}

export function ErrorMsg({ msg }: { msg: string }) {
  if (!msg) return null;
  return <p className="text-sm text-destructive font-medium">{msg}</p>;
}

export function Btn({
  children,
  onClick,
  disabled,
  type = 'button',
  variant = 'primary',
  size = 'md',
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold transition-all rounded-md disabled:opacity-40 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-foreground text-background hover:bg-foreground/85',
    secondary: 'bg-muted border border-border text-foreground hover:bg-accent',
    ghost: 'text-muted-foreground hover:text-foreground hover:bg-muted',
    danger: 'text-destructive hover:bg-destructive/10',
  };
  const sizes = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2.5',
    lg: 'text-sm px-5 py-3',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

export function NavButtons({
  onBack,
  onNext,
  nextLabel = 'Continue',
  nextDisabled,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className={`flex ${onBack ? 'justify-between' : 'justify-end'} pt-4 border-t border-border mt-6`}>
      {onBack && (
        <Btn variant="ghost" onClick={onBack}>
          ← Back
        </Btn>
      )}
      {onNext && (
        <Btn onClick={onNext} disabled={nextDisabled}>
          {nextLabel}
        </Btn>
      )}
    </div>
  );
}

export function StatCard({ label, value, adornment }: { label: string; value: string | number; adornment?: React.ReactNode }) {
  return (
    <div className="border border-border rounded-lg p-4 bg-card">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest font-mono mb-2">
        {label}
      </p>
      <div className="flex items-center gap-2">
        {adornment}
        <p className="text-xl font-bold text-foreground font-mono">{value}</p>
      </div>
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest font-mono">
      {children}
    </p>
  );
}

export function SelectCard({
  selected,
  onClick,
  children,
  className = '',
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-start p-4 rounded-lg border text-left transition-all ${
        selected
          ? 'border-foreground bg-foreground/[0.04] ring-1 ring-foreground/20'
          : 'border-border bg-card hover:border-foreground/20 hover:bg-muted/50'
      } ${className}`}
    >
      {selected && (
        <span className="absolute top-3 right-3 size-4 rounded-full bg-foreground flex items-center justify-center">
          <Check className="size-2.5 text-background" />
        </span>
      )}
      {children}
    </button>
  );
}
