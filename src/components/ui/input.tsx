import * as React from "react";
import { cn } from "@/lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  iconLeft?: React.ReactNode;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, iconLeft, ...rest }, ref) => {
    if (iconLeft) {
      return (
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none">
            {iconLeft}
          </span>
          <input
            ref={ref}
            className={cn(
              "h-11 w-full pl-11 pr-4 rounded-input bg-white border border-line",
              "text-sm text-ink-1 placeholder:text-ink-3",
              "focus:outline-none focus:border-primary-600 focus:ring-4 focus:ring-primary-50",
              "transition-all duration-200",
              className,
            )}
            {...rest}
          />
        </div>
      );
    }
    return (
      <input
        ref={ref}
        className={cn(
          "h-11 w-full px-4 rounded-input bg-white border border-line",
          "text-sm text-ink-1 placeholder:text-ink-3",
          "focus:outline-none focus:border-primary-600 focus:ring-4 focus:ring-primary-50",
          "transition-all duration-200",
          className,
        )}
        {...rest}
      />
    );
  },
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...rest }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full px-4 py-3 rounded-input bg-white border border-line",
      "text-sm text-ink-1 placeholder:text-ink-3 resize-y",
      "focus:outline-none focus:border-primary-600 focus:ring-4 focus:ring-primary-50",
      "transition-all duration-200",
      className,
    )}
    {...rest}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...rest }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-11 w-full px-4 pr-9 rounded-input bg-white border border-line",
      "text-sm text-ink-1 appearance-none",
      "focus:outline-none focus:border-primary-600 focus:ring-4 focus:ring-primary-50",
      "transition-all duration-200",
      "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%226%22 viewBox=%220 0 10 6%22 fill=%22none%22><path d=%22M1 1l4 4 4-4%22 stroke=%22%2394A3B8%22 stroke-width=%221.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/></svg>')] bg-no-repeat bg-[right_14px_center]",
      className,
    )}
    {...rest}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...rest }, ref) => (
  <label
    ref={ref}
    className={cn("block text-xs font-medium text-ink-2 mb-1.5", className)}
    {...rest}
  />
));
Label.displayName = "Label";
