/*
 * Project note: Image Lightbox is a reusable interface component used across Smart Tole.
 * Keep this component focused on display behavior so page-specific business rules stay in the page or service layer.
 */
import { useEffect } from "react";

function ImageLightbox({ isOpen, src, alt, onClose }) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !src) {
    return null;
  }

  return (
    <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={alt || "Image preview"} onClick={onClose}>
      <div className="image-lightbox-panel" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="image-lightbox-close" onClick={onClose} aria-label="Close image preview">
          x
        </button>
        <div className="image-lightbox-media">
          <img src={src} alt={alt || "Notice image"} />
        </div>
      </div>
    </div>
  );
}

export default ImageLightbox;
