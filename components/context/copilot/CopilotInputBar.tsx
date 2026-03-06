'use client';

import { useRef, useCallback } from 'react';
import { Send } from 'lucide-react';
import { useI18n } from '@/components/shared/I18nProvider';

interface CopilotInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  maxLength?: number;
}

export function CopilotInputBar({
  value,
  onChange,
  onSubmit,
  disabled,
  maxLength = 2000,
}: CopilotInputBarProps) {
  const { t } = useI18n();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!disabled && value.trim().length > 0) {
          onSubmit();
        }
      }
    },
    [disabled, value, onSubmit]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value.slice(0, maxLength));
    },
    [onChange, maxLength]
  );

  return (
    <div className="flex-shrink-0 border-t border-border bg-background p-3 md:p-4">
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={t('copilot.input_placeholder')}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px] max-h-32 overflow-y-auto"
          style={{ height: 'auto' }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 128) + 'px';
          }}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || value.trim().length === 0}
          className="flex-shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 transition-colors"
          aria-label={t('copilot.send')}
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {value.length > maxLength * 0.9 && (
        <p className="text-xs text-muted-foreground text-right mt-1 max-w-3xl mx-auto">
          {value.length} / {maxLength}
        </p>
      )}
    </div>
  );
}
