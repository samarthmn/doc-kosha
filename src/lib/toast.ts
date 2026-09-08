import {
  toast,
  type ToastOptions,
  type Id,
  cssTransition,
} from "react-toastify";

/**
 * Toasts slide in from the bottom-right (200ms ease-out) and auto-dismiss
 * with a plain fade (150ms ease-in) — no bounce/spring. The keyframes and
 * timings live centrally in `globals.css` (`.dk-toast-enter` / `.dk-toast-exit`)
 * alongside the rest of the app's motion scaffold; this just wires them in
 * place of react-toastify's default `Bounce` transition.
 */
export const dkToastTransition = cssTransition({
  enter: "dk-toast-enter",
  exit: "dk-toast-exit",
  collapseDuration: 150,
});

const base: ToastOptions = {
  position: "bottom-right",
  autoClose: 3000,
  transition: dkToastTransition,
  className:
    "bg-card text-card-foreground border border-border shadow-lg rounded-lg",
  bodyClassName: "text-sm",
  progressClassName: "!bg-primary",
};

export const showSuccess = (message: string, opts?: ToastOptions): Id =>
  toast.success(message, { ...base, ...opts });

export const showError = (message: string, opts?: ToastOptions): Id =>
  toast.error(message, { ...base, ...opts });

export const showInfo = (message: string, opts?: ToastOptions): Id =>
  toast.info(message, { ...base, ...opts });

export const showWarning = (message: string, opts?: ToastOptions): Id =>
  toast.warning(message, { ...base, ...opts });
