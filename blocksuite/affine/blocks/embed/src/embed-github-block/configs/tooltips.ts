import { html } from 'lit';

// prettier-ignore
export const GithubRepoTooltip = html`<svg width="170" height="68" viewBox="0 0 170 68" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<rect width="170" height="68" rx="2" fill="white"/>
<mask id="mask0_16460_1028" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="170" height="68">
<rect width="170" height="68" rx="2" fill="white"/>
</mask>
<g mask="url(#mask0_16460_1028)">
<rect x="6.5" y="28.5" width="169" height="67" rx="3.5" fill="white" stroke="#E3E2E4"/>
<text fill="#121212" xml:space="preserve" style="white-space: pre" font-family="Inter" font-size="9" letter-spacing="0em"><tspan x="18" y="46.7727">toeverything/</tspan></text>
<text fill="#121212" xml:space="preserve" style="white-space: pre" font-family="Inter" font-size="9" font-weight="bold" letter-spacing="0em"><tspan x="75.041" y="46.7727">AFFiNE</tspan></text>
<text fill="#8E8D91" xml:space="preserve" style="white-space: pre" font-family="Inter" font-size="7" letter-spacing="0em"><tspan x="18" y="57.5455">Write, Draw and Plan All at Once.</tspan></text>
<rect x="146" y="38" width="24" height="24" fill="url(#pattern0_16460_1028)"/>
<text fill="#8E8D91" xml:space="preserve" style="white-space: pre" font-family="Inter" font-size="10" letter-spacing="0px"><tspan x="10" y="18.6364">Link to a GitHub repository.</tspan></text>
</g>
<defs>
<pattern id="pattern0_16460_1028" patternContentUnits="objectBoundingBox" width="1" height="1">
<use xlink:href="#image0_16460_1028" transform="scale(0.0208333)"/>
</pattern>
<image id="image0_16460_1028" width="48" height="48" xlink:href="data:image/png;base64,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"/>
</defs>
</svg>
`;
