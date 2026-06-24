'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-[1px] transition-opacity duration-200"
    >
      <div
        ref={modalRef}
        className="w-full max-w-md bg-white border border-[#EBEBEB] rounded-[10px] p-5 flex flex-col transition-all duration-200 transform scale-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#EBEBEB] mb-4">
          <h3 className="text-sm font-medium text-[#111111]">{title}</h3>
          <button
            onClick={onClose}
            className="text-[#6B6B6B] hover:text-[#111111] transition-colors p-1 rounded-md hover:bg-[#FAFAFA]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 text-sm text-[#6B6B6B]">{children}</div>
      </div>
    </div>
  );
}
