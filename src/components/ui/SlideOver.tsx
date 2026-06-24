'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface SlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function SlideOver({ isOpen, onClose, title, children }: SlideOverProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-[1px] transition-opacity duration-200"
    >
      <div
        ref={containerRef}
        className="w-full max-w-[400px] h-full bg-white border-l border-[#EBEBEB] flex flex-col p-6 animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#EBEBEB] mb-5">
          <h3 className="text-sm font-medium text-[#111111]">{title}</h3>
          <button
            onClick={onClose}
            className="text-[#6B6B6B] hover:text-[#111111] transition-colors p-1 rounded-md hover:bg-[#FAFAFA]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pr-1 text-sm text-[#6B6B6B]">
          {children}
        </div>
      </div>
    </div>
  );
}
