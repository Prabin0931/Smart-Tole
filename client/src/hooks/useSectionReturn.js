/*
 * Project note: Use Section Return is a reusable React hook for page interaction state.
 * Keep the hook small and predictable so screens can share behavior without copying state code.
 */
import { useEffect } from "react";

const SECTION_RETURN_PREFIX = "sectionReturn:";

export function rememberSectionReturn(pageKey, sectionKey) {
  if (!pageKey || !sectionKey) {
    return;
  }

  window.sessionStorage.setItem(`${SECTION_RETURN_PREFIX}${pageKey}`, sectionKey);
}

function useSectionReturn(pageKey, sectionRefs, isReady = true, topOffset = 116) {
  useEffect(() => {
    if (!isReady || !pageKey) {
      return undefined;
    }

    const storageKey = `${SECTION_RETURN_PREFIX}${pageKey}`;
    const savedSectionKey = window.sessionStorage.getItem(storageKey);

    if (!savedSectionKey) {
      return undefined;
    }

    const targetRef = sectionRefs?.[savedSectionKey];
    const targetElement = targetRef?.current;

    if (!targetElement) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const targetTop = window.scrollY + targetElement.getBoundingClientRect().top - topOffset;

      window.scrollTo({
        top: Math.max(targetTop, 0),
        behavior: "smooth"
      });

      window.sessionStorage.removeItem(storageKey);
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [isReady, pageKey, sectionRefs, topOffset]);

  return (sectionKey) => {
    rememberSectionReturn(pageKey, sectionKey);
  };
}

export default useSectionReturn;
