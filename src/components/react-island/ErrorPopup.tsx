import React from 'react';
import { X } from 'lucide-react';
import { useAccessibleModal } from './hooks/useAccessibleModal';

interface ErrorPopupProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
}

const ErrorPopup = ({ isOpen, onClose, title, message }: ErrorPopupProps) => {
  const { dialogRef, handleBackdropClick } = useAccessibleModal({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="error-popup-title"
        className="bg-white rounded-2xl p-6 max-w-sm mx-4 shadow-2xl border border-gray-100"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 id="error-popup-title" className="text-lg font-semibold text-gray-800">{title || "Notification"}</h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <p className="text-gray-600 mb-6 leading-relaxed">{message}</p>
        <button
          onClick={onClose}
          className="w-full bg-gradient-to-r from-blue-400 to-purple-400 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-300 hover:from-blue-500 hover:to-purple-500 hover:scale-[1.01] hover:shadow-lg shadow-md"
        >
          OK
        </button>
      </div>
    </div>
  );
};

export default ErrorPopup;
