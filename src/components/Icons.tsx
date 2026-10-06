import type { SVGProps } from 'react';

const S = ({ s = 16, children, ...p }: { s?: number } & SVGProps<SVGSVGElement>) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>{children}</svg>
);

export const IcoCal = (p: { s?: number }) => (
  <S {...p}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></S>);
export const IcoInbox = (p: { s?: number }) => (
  <S {...p}><path d="M3 12h5l2 3h4l2-3h5" /><path d="M4.5 6.5L3 12v6a2 2 0 002 2h14a2 2 0 002-2v-6l-1.5-5.5A2 2 0 0017.6 5H6.4a2 2 0 00-1.9 1.5z" /></S>);
export const IcoUsers = (p: { s?: number }) => (
  <S {...p}><path d="M17 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M22 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13A4 4 0 0119 7a4 4 0 01-3 3.87" /></S>);
export const IcoUser = (p: { s?: number }) => (
  <S {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></S>);
export const IcoDoor = (p: { s?: number }) => (
  <S {...p}><path d="M4 21h16M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17" /><circle cx="14.5" cy="12" r="1" /></S>);
export const IcoClock = (p: { s?: number }) => (
  <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>);
export const IcoWarn = (p: { s?: number }) => (
  <S {...p}><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /><path d="M12 9v4M12 17h.01" /></S>);
export const IcoInfo = (p: { s?: number }) => (
  <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></S>);
export const IcoDown = (p: { s?: number }) => (
  <S {...p}><path d="M12 3v12M8 11l4 4 4-4M4 19h16" /></S>);
export const IcoEye = (p: { s?: number }) => (
  <S {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></S>);
export const IcoX = (p: { s?: number }) => (<S s={17} {...p}><path d="M18 6L6 18M6 6l12 12" /></S>);
export const IcoPlus = (p: { s?: number }) => (
  <S s={15} strokeWidth={2.2} {...p}><path d="M12 5v14M5 12h14" /></S>);
export const IcoLeft = (p: { s?: number }) => (<S s={17} strokeWidth={2} {...p}><path d="M15 18l-6-6 6-6" /></S>);
export const IcoRight = (p: { s?: number }) => (<S s={17} strokeWidth={2} {...p}><path d="M9 18l6-6-6-6" /></S>);
export const IcoCheck = (p: { s?: number }) => (<S s={10} strokeWidth={3.5} {...p}><path d="M20 6L9 17l-5-5" /></S>);
export const IcoOut = (p: { s?: number }) => (
  <S {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></S>);
export const IcoExpand = (p: { s?: number }) => (
  <S s={15} {...p}><path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3" /></S>);
export const IcoArrow = (p: { s?: number }) => (
  <S s={13} strokeWidth={2} {...p}><path d="M7 17L17 7M9 7h8v8" /></S>);
export const IcoMenu = (p: { s?: number }) => (
  <S {...p}><path d="M4 7h16M4 12h16M4 17h16" /></S>);
export const IcoRepeat = (p: { s?: number }) => (
  <S {...p}><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 013-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 01-3 3H3" /></S>);
export const IcoSheet = (p: { s?: number }) => (
  <S {...p}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 9h18M3 15h18M9 3v18" /></S>);
