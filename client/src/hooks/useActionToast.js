/*
 * Project note: Use Action Toast is a reusable React hook for page interaction state.
 * Keep the hook small and predictable so screens can share behavior without copying state code.
 */
import { useEffect, useState } from "react";

function useActionToast(duration = 2600) {
  const [toast, setToast] = useState({
    kind: "success",
    message: ""
  });

  useEffect(() => {
    if (!toast.message) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setToast({
        kind: "success",
        message: ""
      });
    }, duration);

    return () => window.clearTimeout(timeoutId);
  }, [toast, duration]);

  function showToast(kind, message) {
    setToast({ kind, message });
  }

  return {
    toast,
    showSuccess: (message) => showToast("success", message),
    showError: (message) => showToast("error", message),
    showInfo: (message) => showToast("info", message),
    clearToast: () =>
      setToast({
        kind: "success",
        message: ""
      })
  };
}

export default useActionToast;
