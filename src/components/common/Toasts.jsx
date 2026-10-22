/**
 * Toast host — renders the notification stack from NotificationContext.
 */

import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import { useNotifications } from '@/context/NotificationContext';

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: TriangleAlert,
};

export default function Toasts() {
  const { notifications, dismiss } = useNotifications();

  if (!notifications.length) return null;

  return (
    <div className="toast-stack" role="region" aria-label="Notifications">
      {notifications.map((toast) => {
        const Icon = ICONS[toast.type] || Info;
        return (
          <div
            key={toast.id}
            className={`toast-cn toast-${toast.type}`}
            role={toast.type === 'error' ? 'alert' : 'status'}
            aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
          >
            <span className="toast-icon">
              <Icon size={19} aria-hidden="true" />
            </span>
            <div className="toast-content">
              <div className="toast-title">{toast.title}</div>
              {toast.message && <div className="toast-message">{toast.message}</div>}
            </div>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
