const FRLogo = ({ className = "h-10 w-10" }: { className?: string }) => (
  <svg
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Background rounded square */}
    <rect width="48" height="48" rx="10" fill="#1B2A4A" />
    {/* F shape - green */}
    <path
      d="M14 10h14v5H20v6h7v5h-7v12h-6V10z"
      fill="#4CAF50"
    />
    {/* R shape - partially green, partially orange accent */}
    <path
      d="M28 10h6c3 0 5 2 5 5v3c0 2.5-1.5 4.2-3.8 4.8L40 32h-6l-4-8v8h-2V10zm4 5v5h2c1.2 0 2-0.8 2-2v-1c0-1.2-0.8-2-2-2h-2z"
      fill="#4CAF50"
    />
    {/* Orange accent on R leg */}
    <path
      d="M30 24l4.5 8H40l-4.8-8.2"
      fill="#F57C00"
      stroke="#F57C00"
      strokeWidth="0.5"
    />
  </svg>
);

export default FRLogo;
