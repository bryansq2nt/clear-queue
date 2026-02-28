export function toastError(message: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('clear-queue:toast', {
        detail: { type: 'error', message },
      })
    );
  }
  console.error(message);
}

export function toastSuccess(message: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('clear-queue:toast', {
        detail: { type: 'success', message },
      })
    );
  }
}
