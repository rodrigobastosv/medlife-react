import type { SVGProps } from 'react';

import { cn } from '@/design-system/cn';

/**
 * The icons the app uses, as inline SVG.
 *
 * No icon library: the set is small and fixed, and every one of these is a
 * handful of path data from Material Symbols (Apache 2.0) — the same family the
 * Flutter app draws from. Inlining them means no runtime font download, no
 * flash of missing glyphs, and `currentColor` so an icon always matches the text
 * beside it.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 -960 960 960"
      fill="currentColor"
      // Merged, not overwritten. With `className` coming in through `...rest` a
      // caller that passed a size (`<PeopleIcon className="size-6" />`) replaced
      // the whole string and silently lost `shrink-0`, which let the icon get
      // squashed by a long label in the flex rows these sit in.
      className={cn('size-5 shrink-0', className)}
      // Icons here are always beside a label or inside a button with an
      // aria-label, so they are decorative to a screen reader.
      aria-hidden
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M240-200h120v-240h240v240h120v-360L480-740 240-560v360Zm-80 80v-480l320-240 320 240v480H520v-240h-80v240H160Z" />
  </Icon>
);

export const CalendarIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Z" />
  </Icon>
);

export const PeopleIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M0-240v-63q0-43 44-70t116-27q13 0 25 .5t23 2.5q-14 21-21 44t-7 48v65H0Zm240 0v-65q0-32 17.5-58.5T307-410q32-20 76.5-30t96.5-10q53 0 97.5 10t76.5 30q32 20 49 46.5t17 58.5v65H240Zm540 0v-65q0-26-6.5-49T754-397q11-2 22.5-2.5t23.5-.5q72 0 116 26.5t44 70.5v63H780ZM160-440q-33 0-56.5-23.5T80-520q0-34 23.5-57t56.5-23q34 0 57 23t23 57q0 33-23 56.5T160-440Zm640 0q-33 0-56.5-23.5T720-520q0-34 23.5-57t56.5-23q34 0 57 23t23 57q0 33-23 56.5T800-440Zm-320-40q-50 0-85-35t-35-85q0-51 35-85.5t85-34.5q51 0 85.5 34.5T600-600q0 50-34.5 85T480-480Z" />
  </Icon>
);

export const ChartIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M640-160v-280h120v280H640Zm-220 0v-640h120v640H420Zm-220 0v-440h120v440H200Z" />
  </Icon>
);

export const BadgeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M160-120q-33 0-56.5-23.5T80-200v-560q0-33 23.5-56.5T160-840h240v-40q0-17 11.5-28.5T440-920h80q17 0 28.5 11.5T560-880v40h240q33 0 56.5 23.5T880-760v560q0 33-23.5 56.5T800-120H160Zm0-80h640v-560H160v560Zm80-80h240v-18q0-17-9.5-31.5T444-352q-20-9-40.5-13.5T360-370q-23 0-43.5 4.5T276-352q-17 8-26.5 22.5T240-298v18Zm320-60h160v-60H560v60Zm-200-60q25 0 42.5-17.5T420-460q0-25-17.5-42.5T360-520q-25 0-42.5 17.5T300-460q0 25 17.5 42.5T360-400Zm200-60h160v-60H560v60Z" />
  </Icon>
);

export const SettingsIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm112-260q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Z" />
  </Icon>
);

export const PlusIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z" />
  </Icon>
);

export const SearchIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z" />
  </Icon>
);

export const ChevronRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z" />
  </Icon>
);

export const ArrowBackIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M313-440l224 224-57 56-320-320 320-320 57 56-224 224h487v80H313Z" />
  </Icon>
);

export const BellIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M160-200v-80h80v-280q0-83 50-147.5T420-792v-28q0-25 17.5-42.5T480-880q25 0 42.5 17.5T540-820v28q80 20 130 84.5T720-560v280h80v80H160Zm320-300Zm0 420q-33 0-56.5-23.5T400-160h160q0 33-23.5 56.5T480-80Z" />
  </Icon>
);

export const RepeatIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M280-80 120-240l160-160 56 58-62 62h406v-160h80v240H274l62 62-56 58Zm-40-440v-240h486l-62-62 56-58 160 160-160 160-56-58 62-62H320v160h-80Z" />
  </Icon>
);

export const PhoneIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M798-120q-125 0-247-54.5T329-329Q229-429 174.5-551T120-798q0-18 12-30t30-12h162q14 0 25 9.5t13 22.5l26 140q2 16-1 27t-11 19l-97 98q20 37 47.5 71.5T387-386q31 31 65 57.5t72 48.5l94-94q9-9 23.5-13.5T670-390l138 28q14 4 23 14.5t9 23.5v162q0 18-12 30t-30 12ZM241-600l66-66-17-94h-89q5 41 14 81t26 79Zm358 358q39 17 79.5 27t81.5 13v-88l-94-19-67 67ZM241-600Zm358 358Z" />
  </Icon>
);

/**
 * The WhatsApp action's icon — a chat bubble, not the WhatsApp logo.
 *
 * The mark is a registered trademark and lives in a different icon family from
 * everything else here, so shipping it would mean a second licence and a second
 * drawing style for one button. The label beside it already says "WhatsApp";
 * the icon only has to say "message".
 */
export const ChatIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M240-400h320v-80H240v80Zm0-120h480v-80H240v80Zm0-120h480v-80H240v80ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z" />
  </Icon>
);

export const CakeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M160-80q-17 0-28.5-11.5T120-120v-219q0-24.75 17.63-42.38Q155.25-399 180-399h27v-182q0-24.75 17.63-42.38Q242.25-641 267-641h183v-64q-20-14-30.5-30.53-10.5-16.54-10.5-39.88 0-14.59 5.5-28.09T430-827l50-53 50 53q10 10 16 23.5t6 28.09q0 23.34-11 39.88Q530-719 510-705v64h183q24.75 0 42.38 17.62Q753-605.75 753-581v182h27q24.75 0 42.38 17.62Q840-363.75 840-339v219q0 17-11.5 28.5T800-80H160Zm107-319h426v-182H267v182Zm-87 259h600v-199H180v199Z" />
  </Icon>
);

export const LogoutIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h280v80H200Zm440-160-55-58 102-102H360v-80h327L585-622l55-58 200 200-200 200Z" />
  </Icon>
);

export const EditIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z" />
  </Icon>
);

export const TrashIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z" />
  </Icon>
);

export const MenuIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M120-240v-80h720v80H120Zm0-200v-80h720v80H120Zm0-200v-80h720v80H120Z" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
  </Icon>
);

/** The brand mark: a leaf-shaped drop with an ECG line, matching the Flutter logo. */
export const Logo = ({ className = 'size-8' }: { className?: string }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden focusable="false">
    <path d="M24 4c8 6 14 12.5 14 21a14 14 0 1 1-28 0c0-8.5 6-15 14-21Z" className="fill-primary" />
    <path
      d="M14 27h6l3-6 4 11 3-5h4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-on-primary"
    />
  </svg>
);
