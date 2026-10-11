import React from "react"

const WeChatPay = ({ size = 24 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect width="24" height="24" rx="6" fill="#07C160" />
    <path
      d="M10.1 6.1c-3.3 0-6 2.2-6 4.9 0 1.5.8 2.8 2.1 3.7l-.5 1.7 2-.9c.7.2 1.5.4 2.4.4h.5a4.5 4.5 0 0 1-.2-1.3c0-2.6 2.4-4.7 5.4-4.7h.2c-.7-2.2-3-3.8-5.9-3.8Z"
      fill="white"
    />
    <path
      d="M20 14.6c0-2.1-2-3.9-4.4-3.9-2.5 0-4.5 1.8-4.5 3.9s2 3.9 4.5 3.9c.7 0 1.3-.1 1.9-.3l1.7.8-.4-1.5c.8-.7 1.2-1.7 1.2-2.9Z"
      fill="white"
    />
    <circle cx="8.1" cy="10" r=".7" fill="#07C160" />
    <circle cx="12.1" cy="10" r=".7" fill="#07C160" />
    <circle cx="14.1" cy="14" r=".6" fill="#07C160" />
    <circle cx="17.2" cy="14" r=".6" fill="#07C160" />
  </svg>
)

export default WeChatPay
