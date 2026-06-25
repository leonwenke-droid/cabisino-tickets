export function FloorplanArchitecture() {
  return (
    <>
      {/* Staircase/entrance box: two rooms split by a divider below table 24 */}
      <g stroke="#ffffff" strokeWidth={3} fill="none" strokeLinecap="square">
        <line x1={809} y1={715} x2={893} y2={715} />
        <line x1={893} y1={715} x2={954} y2={715} />
        <line x1={1014} y1={715} x2={1075} y2={715} />
        <line x1={809} y1={797} x2={893} y2={797} />
        <line x1={893} y1={797} x2={954} y2={797} />
        <line x1={1014} y1={797} x2={1075} y2={797} />
        <line x1={1075} y1={715} x2={1075} y2={797} />
        <line x1={809} y1={715} x2={809} y2={740} />
        <line x1={809} y1={772} x2={809} y2={797} />
        <line x1={893} y1={715} x2={893} y2={797} />
      </g>

      {/* Staircase treads, right-aligned in the left room */}
      <g stroke="#888888" strokeWidth={1.5}>
        <line x1={850} y1={721} x2={850} y2={791} />
        <line x1={861} y1={721} x2={861} y2={791} />
        <line x1={872} y1={721} x2={872} y2={791} />
        <line x1={883} y1={721} x2={883} y2={791} />
      </g>

      {/* Entrance arrow + label */}
      <g
        stroke="#3fae5c"
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1={809} y1={756} x2={755} y2={756} />
        <polyline points="775,740 755,756 775,772" />
      </g>
      <text
        x={782}
        y={830}
        fill="#3fae5c"
        fontSize={18}
        fontWeight={700}
        textAnchor="middle"
        fontFamily="system-ui, sans-serif"
      >
        EINGANG
      </text>

      {/* Wavy curtain divider between table 4 and table 13 (x≈500) */}
      <path
        d="M 500 360
           C 492 380, 508 400, 500 420
           C 492 440, 508 460, 500 480
           C 492 500, 508 520, 500 540
           C 492 560, 508 580, 500 600
           C 492 620, 508 640, 500 660
           C 492 680, 508 700, 500 720
           C 492 740, 508 760, 500 780
           C 492 800, 508 815, 500 830"
        stroke="#9ca3af"
        strokeWidth={2.5}
        fill="none"
        opacity={0.75}
      />

      {/* Abluftöffnung: masonry ventilation shaft, ceiling to floor, between tables 54 and 60 */}
      <rect
        x={1580}
        y={540}
        width={65}
        height={110}
        fill="none"
        stroke="#ffffff"
        strokeWidth={3}
      />
    </>
  );
}
