/** An illustrative workflow, kept as SVG so it stays sharp on every screen. */
export function SupportVisual({ compact = false }: { compact?: boolean }) {
  return (
    <figure className={compact ? "support-visual compact" : "support-visual"}>
      <svg
        viewBox="0 0 520 490"
        role="img"
        aria-labelledby={
          compact ? "support-visual-auth" : "support-visual-home"
        }
      >
        <title id={compact ? "support-visual-auth" : "support-visual-home"}>
          Illustrated support workflow: a customer question, a policy document,
          and a draft ready for human review.
        </title>
        <defs>
          <pattern
            id={compact ? "auth-dots" : "home-dots"}
            width="22"
            height="22"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1" fill="#a5c2d6" opacity=".28" />
          </pattern>
          <filter
            id={compact ? "auth-shadow" : "home-shadow"}
            x="-25%"
            y="-30%"
            width="160%"
            height="180%"
          >
            <feDropShadow
              dx="0"
              dy="10"
              stdDeviation="11"
              floodColor="#14232d"
              floodOpacity=".18"
            />
          </filter>
        </defs>
        <rect x="0" y="0" width="520" height="490" rx="28" fill="#1c3c50" />
        <rect
          x="0"
          y="0"
          width="520"
          height="490"
          rx="28"
          fill={`url(#${compact ? "auth-dots" : "home-dots"})`}
        />
        <path
          d="M-34 349C79 235 105 408 254 325S455 330 553 203V530H-34Z"
          fill="#234d6b"
          opacity=".45"
        />
        <circle cx="435" cy="74" r="92" fill="#456982" opacity=".15" />
        <circle cx="63" cy="415" r="74" fill="#a5c2d6" opacity=".09" />
        <path
          d="M153 166C78 190 63 263 153 283M373 245C448 267 455 335 378 367"
          fill="none"
          stroke="#a8c4d8"
          strokeWidth="2"
          strokeDasharray="5 7"
          opacity=".7"
        />
        <g
          transform="translate(44 48) rotate(-4 165 72)"
          filter={`url(#${compact ? "auth-shadow" : "home-shadow"})`}
        >
          <rect width="332" height="145" rx="12" fill="#ffffff" />
          <circle cx="34" cy="32" r="15" fill="#dfe8ef" />
          <path
            d="M29 29a5 5 0 1 0 10 0a5 5 0 1 0-10 0M25 42q9-10 18 0"
            fill="none"
            stroke="#234d6b"
            strokeWidth="1.6"
          />
          <text x="58" y="29" fill="#384955" fontSize="12" fontWeight="600">
            A question from Jamie
          </text>
          <text x="58" y="46" fill="#7b95a7" fontSize="9">
            Subscription · fictional example
          </text>
          <path d="M20 62H311" stroke="#e7ecf0" />
          <text x="22" y="87" fill="#3d4e5b" fontSize="14">
            “I subscribed 12 days ago.
          </text>
          <text x="22" y="109" fill="#3d4e5b" fontSize="14">
            Can I still request a refund?”
          </text>
          <circle cx="299" cy="29" r="4" fill="#9ab7cc" />
        </g>
        <g
          transform="translate(180 198) rotate(5 141 65)"
          filter={`url(#${compact ? "auth-shadow" : "home-shadow"})`}
        >
          <rect width="296" height="135" rx="11" fill="#d8e4ed" />
          <path
            d="M23 23h15l7 7v20H23ZM38 23v8h7M28 38h12M28 43h9"
            fill="none"
            stroke="#234d6b"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <text x="57" y="31" fill="#234d6b" fontSize="12" fontWeight="600">
            The policy behind the answer
          </text>
          <text x="57" y="47" fill="#627f94" fontSize="9">
            Refund policy · version 1
          </text>
          <rect x="20" y="65" width="257" height="47" rx="5" fill="#eef4f8" />
          <rect x="27" y="73" width="4" height="29" rx="2" fill="#456982" />
          <text x="40" y="84" fill="#506778" fontSize="11">
            Refund requests: within 30 days
          </text>
          <text x="40" y="100" fill="#506778" fontSize="11">
            of the first paid invoice.
          </text>
        </g>
        <g
          transform="translate(54 347) rotate(-2 163 48)"
          filter={`url(#${compact ? "auth-shadow" : "home-shadow"})`}
        >
          <rect width="347" height="98" rx="11" fill="#ffffff" />
          <rect x="18" y="18" width="34" height="34" rx="9" fill="#e5edf3" />
          <path
            d="m28 39 3-9 7-7 5 5-7 7-8 4M36 24l5 5"
            fill="none"
            stroke="#234d6b"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <text x="65" y="31" fill="#384955" fontSize="12" fontWeight="600">
            A draft your team can work with
          </text>
          <text x="65" y="48" fill="#7993a5" fontSize="10">
            Check the details. Make it your own.
          </text>
          <path d="M20 64H326" stroke="#e7ecf0" />
          <circle cx="26" cy="80" r="3" fill="#456982" />
          <text x="37" y="83" fill="#234d6b" fontSize="9">
            Waiting for a person to review
          </text>
          <text x="263" y="83" fill="#829aab" fontSize="9">
            Not sent
          </text>
        </g>
        <g transform="translate(419 368)">
          <circle r="27" fill="#a3c1d6" />
          <path
            d="m-10 0 7 7 14-16"
            fill="none"
            stroke="#234d6b"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <path d="m424 141 3 10 10 3-10 3-3 10-3-10-10-3 10-3Z" fill="#a5c2d7" />
        <circle cx="86" cy="299" r="5" fill="#a5c2d7" opacity=".6" />
      </svg>
      {!compact && (
        <figcaption>
          A little help with the draft. A person behind the reply.
        </figcaption>
      )}
    </figure>
  );
}
