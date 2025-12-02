'use client';

import { ReactNode } from 'react';
import styles from './Tooltip.module.css';

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  type?: 'default' | 'mismatch' | 'match' | 'unknown';
}

export default function Tooltip({ children, content, type = 'default' }: TooltipProps) {
  return (
    <span className={styles.tooltip}>
      {children}
      <span className={`${styles.tooltipContent} ${styles[type]}`}>
        {content}
      </span>
    </span>
  );
}

