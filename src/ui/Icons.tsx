interface IconProps {
  size?: number
}

/** Iconos de trazo, 24×24. Inline para no depender de ninguna librería externa. */
function svg(path: React.ReactNode, size: number, filled = false) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  )
}

export const IconSelect = ({ size = 18 }: IconProps) =>
  svg(<path d="M4 3l7.5 17 2.2-6.9L20.5 11 4 3z" />, size)

export const IconHand = ({ size = 18 }: IconProps) =>
  svg(
    <>
      <path d="M9 11V5.5a1.5 1.5 0 013 0V11" />
      <path d="M12 11V4.5a1.5 1.5 0 013 0V11" />
      <path d="M15 11.5V7a1.5 1.5 0 013 0v7a7 7 0 01-7 7h-1a6 6 0 01-5.2-3l-2-3.4a1.5 1.5 0 012.5-1.6L9 15" />
      <path d="M9 15V5.5" />
    </>,
    size,
  )

export const IconBrush = ({ size = 18 }: IconProps) =>
  svg(
    <>
      <path d="M15.5 3.5l5 5L11 18H6v-5z" />
      <path d="M13 6l5 5" />
    </>,
    size,
  )

export const IconEraser = ({ size = 18 }: IconProps) =>
  svg(
    <>
      <path d="M8.5 20H20" />
      <path d="M13.5 4.5l6 6-8 8h-4l-3-3z" />
      <path d="M9 9l6 6" />
    </>,
    size,
  )

export const IconBucket = ({ size = 18 }: IconProps) =>
  svg(
    <>
      <path d="M6.5 8.5L12 3l7 7-6 6a2 2 0 01-2.8 0l-3.7-3.7a2 2 0 010-2.8z" />
      <path d="M4 12l3-3" />
      <path d="M20 15c1.3 1.8 2 3 2 3.8a2 2 0 11-4 0c0-.8.7-2 2-3.8z" />
    </>,
    size,
  )

export const IconDropper = ({ size = 18 }: IconProps) =>
  svg(
    <>
      <path d="M17.5 3.5a2.5 2.5 0 013 3l-2 2 1 1-2.5 2.5-1-1L8 18l-3 1 1-3 7-8-1-1L14.5 4.5l1 1z" />
    </>,
    size,
  )

export const IconLine = ({ size = 18 }: IconProps) => svg(<path d="M4 20L20 4" />, size)

export const IconArrow = ({ size = 18 }: IconProps) =>
  svg(
    <>
      <path d="M4 20L20 4" />
      <path d="M20 10V4h-6" />
    </>,
    size,
  )

export const IconRect = ({ size = 18 }: IconProps) =>
  svg(<rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />, size)

export const IconEllipse = ({ size = 18 }: IconProps) =>
  svg(<ellipse cx="12" cy="12" rx="8.5" ry="7" />, size)

export const IconTriangle = ({ size = 18 }: IconProps) =>
  svg(<path d="M12 4l8.5 15h-17z" />, size)

export const IconDiamond = ({ size = 18 }: IconProps) =>
  svg(<path d="M12 3l8 9-8 9-8-9z" />, size)

export const IconStar = ({ size = 18 }: IconProps) =>
  svg(<path d="M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17.2 6.7 20l1.1-6L3.4 9.9l6-.8z" />, size)

export const IconHexagon = ({ size = 18 }: IconProps) =>
  svg(<path d="M12 3l7.5 4.5v9L12 21l-7.5-4.5v-9z" />, size)

export const IconText = ({ size = 18 }: IconProps) =>
  svg(
    <>
      <path d="M5 6V4.5h14V6" />
      <path d="M12 4.5V20" />
      <path d="M9 20h6" />
    </>,
    size,
  )

export const IconImage = ({ size = 18 }: IconProps) =>
  svg(
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M4 17l5-5 4 4 2.5-2.5L20 17" />
    </>,
    size,
  )

export const IconUndo = ({ size = 18 }: IconProps) =>
  svg(
    <>
      <path d="M4 9h10a5 5 0 010 10h-3" />
      <path d="M8 5L4 9l4 4" />
    </>,
    size,
  )

export const IconRedo = ({ size = 18 }: IconProps) =>
  svg(
    <>
      <path d="M20 9H10a5 5 0 000 10h3" />
      <path d="M16 5l4 4-4 4" />
    </>,
    size,
  )

export const IconTrash = ({ size = 18 }: IconProps) =>
  svg(
    <>
      <path d="M4 6.5h16" />
      <path d="M9.5 6.5V4.5h5v2" />
      <path d="M6.5 6.5l1 13h9l1-13" />
    </>,
    size,
  )

export const IconDownload = ({ size = 18 }: IconProps) =>
  svg(
    <>
      <path d="M12 3.5v11" />
      <path d="M8 11l4 4 4-4" />
      <path d="M4 17v2.5h16V17" />
    </>,
    size,
  )

export const IconUpload = ({ size = 18 }: IconProps) =>
  svg(
    <>
      <path d="M12 15.5v-11" />
      <path d="M8 8l4-4 4 4" />
      <path d="M4 17v2.5h16V17" />
    </>,
    size,
  )

export const IconGrid = ({ size = 18 }: IconProps) =>
  svg(
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M9 3.5v17M15 3.5v17M3.5 9h17M3.5 15h17" />
    </>,
    size,
  )

export const IconLayers = ({ size = 18 }: IconProps) =>
  svg(
    <>
      <path d="M12 3.5l8.5 4.5L12 12.5 3.5 8z" />
      <path d="M3.5 12.5L12 17l8.5-4.5" />
      <path d="M3.5 17L12 21.5 20.5 17" />
    </>,
    size,
  )

export const IconEye = ({ size = 16 }: IconProps) =>
  svg(
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>,
    size,
  )

export const IconEyeOff = ({ size = 16 }: IconProps) =>
  svg(
    <>
      <path d="M4 4l16 16" />
      <path d="M9.6 6.1A9.6 9.6 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 01-3.3 4" />
      <path d="M6.4 8.2A17 17 0 002.5 12S6 18.5 12 18.5c1.2 0 2.3-.2 3.3-.6" />
    </>,
    size,
  )

export const IconLock = ({ size = 16 }: IconProps) =>
  svg(
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 018 0v2.5" />
    </>,
    size,
  )

export const IconUnlock = ({ size = 16 }: IconProps) =>
  svg(
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 017.5-2" />
    </>,
    size,
  )

export const IconFlipH = ({ size = 16 }: IconProps) =>
  svg(
    <>
      <path d="M12 3v18" strokeDasharray="2 2.5" />
      <path d="M9 7L4 12l5 5z" />
      <path d="M15 7l5 5-5 5z" />
    </>,
    size,
  )

export const IconFlipV = ({ size = 16 }: IconProps) =>
  svg(
    <>
      <path d="M3 12h18" strokeDasharray="2 2.5" />
      <path d="M7 9L12 4l5 5z" />
      <path d="M7 15l5 5 5-5z" />
    </>,
    size,
  )

export const IconRotate = ({ size = 16 }: IconProps) =>
  svg(
    <>
      <path d="M20 12a8 8 0 11-2.6-5.9" />
      <path d="M20 4v4h-4" />
    </>,
    size,
  )

export const IconFlatten = ({ size = 16 }: IconProps) =>
  svg(
    <>
      <rect x="3.5" y="3.5" width="8" height="8" rx="1" />
      <rect x="12.5" y="12.5" width="8" height="8" rx="1" />
      <path d="M11.5 7.5h4a1 1 0 011 1v4" strokeDasharray="2 2" />
    </>,
    size,
  )

export const IconPlus = ({ size = 16 }: IconProps) =>
  svg(<path d="M12 5v14M5 12h14" />, size)

export const IconMinus = ({ size = 16 }: IconProps) => svg(<path d="M5 12h14" />, size)

export const IconFit = ({ size = 16 }: IconProps) =>
  svg(
    <>
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
      <path d="M4 15v5h5" />
      <path d="M20 15v5h-5" />
    </>,
    size,
  )

export const IconMenu = ({ size = 18 }: IconProps) =>
  svg(<path d="M4 7h16M4 12h16M4 17h16" />, size)

export const IconClose = ({ size = 16 }: IconProps) =>
  svg(<path d="M6 6l12 12M18 6L6 18" />, size)

export const IconHelp = ({ size = 18 }: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.7-1.5 1.2-1.5 2.3" />
      <path d="M12 17.5h.01" />
    </>,
    size,
  )
