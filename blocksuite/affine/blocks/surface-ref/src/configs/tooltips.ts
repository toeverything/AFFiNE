import { html } from 'lit';
// prettier-ignore
export const EdgelessTooltip = html`<svg width="170" height="106" viewBox="0 0 170 106" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="170" height="106" rx="2" fill="white"/>
<mask id="mask0_16460_1252" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="170" height="106">
<rect width="170" height="106" rx="2" fill="white"/>
</mask>
<g mask="url(#mask0_16460_1252)">
<rect x="100.5" y="42.6565" width="141" height="51" stroke="#1E96EB" stroke-width="3" stroke-dasharray="5 5"/>
<circle cx="101.5" cy="43.5" r="6" fill="white" stroke="#1E96EB" stroke-width="3"/>
<rect x="105" y="8" width="59" height="26" rx="10" fill="black" fill-opacity="0.1"/>
<text fill="#121212" xml:space="preserve" style="white-space: pre" font-family="Inter" font-size="12" letter-spacing="0em"><tspan x="117" y="25.3636">Group</tspan></text>
<mask id="mask1_16460_1252" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="98" height="106">
<path d="M0 1.5C0 0.947717 0.447715 0.5 1 0.5H96.2527C96.8927 0.5 97.368 1.09278 97.2288 1.71742L74.1743 105.217C74.0725 105.675 73.6667 106 73.1982 106H0.999999C0.447715 106 0 105.552 0 105V1.5Z" fill="#F4F4F5"/>
</mask>
<g mask="url(#mask1_16460_1252)">
<path d="M0 1.5C0 0.947717 0.447715 0.5 1 0.5H96.2527C96.8927 0.5 97.368 1.09278 97.2288 1.71742L74.1743 105.217C74.0725 105.675 73.6667 106 73.1982 106H0.999999C0.447715 106 0 105.552 0 105V1.5Z" fill="#F4F4F5"/>
<rect x="23" y="41.6565" width="142" height="52" rx="9" stroke="black" stroke-opacity="0.5" stroke-width="2"/>
<path d="M23 12.4244C23 10.0964 24.8829 8.20923 27.2056 8.20923H71.7846C74.1073 8.20923 75.9902 10.0964 75.9902 12.4244V29.2849C75.9902 31.6128 74.1073 33.5 71.7846 33.5H27.2056C24.8829 33.5 23 31.6128 23 29.2849V12.4244Z" fill="black" fill-opacity="0.8"/>
<path d="M64.0353 25.2043C63.415 25.2043 62.8798 25.0674 62.4299 24.7935C61.9828 24.5169 61.6377 24.1313 61.3946 23.6367C61.1543 23.1393 61.0341 22.5608 61.0341 21.9014C61.0341 21.2419 61.1543 20.6606 61.3946 20.1577C61.6377 19.6519 61.9759 19.2579 62.409 18.9756C62.8449 18.6906 63.3535 18.5481 63.9347 18.5481C64.27 18.5481 64.6012 18.604 64.9281 18.7158C65.2551 18.8275 65.5527 19.0092 65.8209 19.2607C66.0892 19.5094 66.303 19.8391 66.4622 20.2499C66.6215 20.6606 66.7012 21.1664 66.7012 21.7672V22.1864H61.7383V21.3313H65.6952C65.6952 20.968 65.6225 20.6439 65.4772 20.3589C65.3347 20.0738 65.1307 19.8489 64.8652 19.684C64.6026 19.5191 64.2924 19.4367 63.9347 19.4367C63.5407 19.4367 63.1998 19.5345 62.912 19.7301C62.6269 19.9229 62.4076 20.1744 62.2539 20.4846C62.1002 20.7948 62.0234 21.1273 62.0234 21.4822V22.0523C62.0234 22.5385 62.1072 22.9506 62.2748 23.2888C62.4453 23.6241 62.6814 23.8798 62.9832 24.0558C63.285 24.2291 63.6357 24.3157 64.0353 24.3157C64.2952 24.3157 64.5299 24.2794 64.7395 24.2067C64.9519 24.1313 65.1349 24.0195 65.2886 23.8714C65.4423 23.7205 65.561 23.5333 65.6449 23.3097L66.6006 23.578C66.5 23.9021 66.3309 24.1872 66.0934 24.4331C65.8558 24.6762 65.5624 24.8662 65.2131 25.0031C64.8638 25.1373 64.4712 25.2043 64.0353 25.2043Z" fill="white"/>
<path d="M51.0779 25.0702V18.6319H52.0336V19.6379H52.1174C52.2515 19.2942 52.4681 19.0273 52.7671 18.8373C53.0661 18.6445 53.4252 18.5481 53.8443 18.5481C54.2691 18.5481 54.6226 18.6445 54.9048 18.8373C55.1898 19.0273 55.412 19.2942 55.5713 19.6379H55.6383C55.8032 19.3054 56.0505 19.0413 56.3802 18.8457C56.71 18.6473 57.1054 18.5481 57.5665 18.5481C58.1421 18.5481 58.613 18.7283 58.979 19.0888C59.3451 19.4465 59.5281 20.004 59.5281 20.7612V25.0702H58.5389V20.7612C58.5389 20.2862 58.409 19.9467 58.1491 19.7427C57.8892 19.5387 57.5832 19.4367 57.2311 19.4367C56.7784 19.4367 56.4278 19.5736 56.179 19.8475C55.9303 20.1185 55.806 20.4622 55.806 20.8786V25.0702H54.8V20.6606C54.8 20.2946 54.6813 19.9998 54.4437 19.7762C54.2062 19.5499 53.9002 19.4367 53.5258 19.4367C53.2687 19.4367 53.0284 19.5052 52.8048 19.6421C52.5841 19.779 52.4052 19.969 52.2683 20.2121C52.1342 20.4525 52.0671 20.7305 52.0671 21.0463V25.0702H51.0779Z" fill="white"/>
<path d="M46.3224 25.2211C45.9144 25.2211 45.5442 25.1442 45.2116 24.9905C44.8791 24.8341 44.615 24.6091 44.4194 24.3157C44.2238 24.0195 44.126 23.6618 44.126 23.2427C44.126 22.8738 44.1987 22.5748 44.344 22.3457C44.4893 22.1137 44.6835 21.9321 44.9266 21.8008C45.1697 21.6694 45.438 21.5716 45.7314 21.5073C46.0276 21.4403 46.3252 21.3872 46.6242 21.3481C47.0154 21.2978 47.3326 21.26 47.5757 21.2349C47.8216 21.207 48.0004 21.1608 48.1122 21.0966C48.2268 21.0323 48.284 20.9205 48.284 20.7612V20.7277C48.284 20.3141 48.1709 19.9928 47.9445 19.7637C47.721 19.5345 47.3815 19.4199 46.926 19.4199C46.4537 19.4199 46.0835 19.5233 45.8152 19.7301C45.547 19.9369 45.3583 20.1577 45.2493 20.3924L44.3104 20.0571C44.4781 19.6658 44.7017 19.3613 44.9811 19.1433C45.2633 18.9225 45.5707 18.7689 45.9032 18.6822C46.2386 18.5928 46.5683 18.5481 46.8924 18.5481C47.0992 18.5481 47.3368 18.5732 47.605 18.6235C47.8761 18.671 48.1373 18.7702 48.3888 18.9211C48.6431 19.072 48.8541 19.2998 49.0218 19.6044C49.1894 19.909 49.2733 20.3169 49.2733 20.8283V25.0702H48.284V24.1983H48.2337C48.1667 24.3381 48.0549 24.4876 47.8984 24.6468C47.7419 24.8061 47.5338 24.9416 47.2739 25.0534C47.014 25.1652 46.6968 25.2211 46.3224 25.2211ZM46.4733 24.3325C46.8645 24.3325 47.1942 24.2556 47.4625 24.1019C47.7336 23.9482 47.9375 23.7498 48.0745 23.5067C48.2142 23.2636 48.284 23.0079 48.284 22.7397V21.8343C48.2421 21.8846 48.1499 21.9307 48.0074 21.9726C47.8677 22.0117 47.7056 22.0467 47.5212 22.0774C47.3395 22.1053 47.1621 22.1305 46.9889 22.1528C46.8184 22.1724 46.6801 22.1892 46.5739 22.2031C46.3168 22.2367 46.0765 22.2912 45.8529 22.3666C45.6322 22.4393 45.4533 22.5497 45.3164 22.6978C45.1823 22.8431 45.1152 23.0415 45.1152 23.293C45.1152 23.6367 45.2424 23.8965 45.4967 24.0726C45.7537 24.2458 46.0793 24.3325 46.4733 24.3325Z" fill="white"/>
<path d="M40.0364 25.0704V18.6321H40.9921V19.6045H41.0592C41.1765 19.286 41.3889 19.0275 41.6963 18.8291C42.0037 18.6307 42.3502 18.5315 42.7358 18.5315C42.8084 18.5315 42.8993 18.5329 43.0082 18.5357C43.1172 18.5385 43.1997 18.5427 43.2556 18.5483V19.5542C43.222 19.5459 43.1452 19.5333 43.025 19.5165C42.9077 19.497 42.7833 19.4872 42.652 19.4872C42.339 19.4872 42.0596 19.5528 41.8136 19.6842C41.5705 19.8127 41.3777 19.9916 41.2352 20.2207C41.0955 20.447 41.0256 20.7055 41.0256 20.9961V25.0704H40.0364Z" fill="white"/>
<path d="M33.3126 25.0704V16.4861H38.4598V17.4082H34.3521V20.3088H38.0742V21.2309H34.3521V25.0704H33.3126Z" fill="white"/>
</g>
</g>
</svg>
`;

// prettier-ignore
export const FrameTooltip = html`<svg width="170" height="89" viewBox="0 0 170 89" fill="none" xmlns="http://www.w3.org/2000/svg">
<g clip-path="url(#clip0_5269_147682)">
<rect width="170" height="89" fill="white"/>
<text fill="#8E8D91" xml:space="preserve" style="white-space: pre" font-family="Inter" font-size="10" letter-spacing="0px"><tspan x="8" y="16.6364">Create a blank frame in Edgeless</tspan></text>
<rect x="16" y="45" width="164" height="59" rx="3" stroke="black" stroke-opacity="0.52" stroke-width="2"/>
<rect x="15" y="27" width="32" height="13" rx="3" fill="black" fill-opacity="0.95"/>
<text fill="white" xml:space="preserve" style="white-space: pre" font-family="Inter" font-size="8" font-weight="500" letter-spacing="0px"><tspan x="19" y="35.8182">Frame</tspan></text>
</g>
<defs>
<clipPath id="clip0_5269_147682">
<rect width="170" height="89" fill="white"/>
</clipPath>
</defs>
</svg>
`

// prettier-ignore
export const MindMapTooltip = html`<svg width="170" height="106" viewBox="0 0 170 106" fill="none" xmlns="http://www.w3.org/2000/svg">
<g clip-path="url(#clip0_5150_67028)">
<rect width="170" height="106" fill="white"/>
<text fill="#8E8D91" xml:space="preserve" style="white-space: pre" font-family="Inter" font-size="10" letter-spacing="0px"><tspan x="8" y="16.6364">Create a mind map in Edgeless</tspan></text>
<g filter="url(#filter0_d_5150_67028)">
<rect x="21" y="53" width="59" height="19" rx="5" stroke="#29A3FA" stroke-width="2"/>
<text fill="black" xml:space="preserve" style="white-space: pre" font-family="Poppins" font-size="8" font-weight="500" letter-spacing="0px"><tspan x="30.5" y="65.076">Mind Map</tspan></text>
</g>
<g filter="url(#filter1_d_5150_67028)">
<rect x="119.75" y="30" width="28.25" height="13.125" rx="5" stroke="#6E52DF" stroke-width="2"/>
</g>
<g filter="url(#filter2_d_5150_67028)">
<rect x="119.75" y="55.8013" width="28.25" height="13.125" rx="5" stroke="#E660A4" stroke-width="2"/>
</g>
<g filter="url(#filter3_d_5150_67028)">
<rect x="119.75" y="81.603" width="28.25" height="13.125" rx="5" stroke="#FF8C38" stroke-width="2"/>
</g>
<path d="M81.5139 62.7686C104.205 62.7686 97.1139 88.7686 120.514 88.7686" stroke="#FF8C38" stroke-width="2"/>
<path d="M81.5139 62.7686C104.205 62.7686 97.1139 62.7686 120.514 62.7686" stroke="#E660A4" stroke-width="2"/>
<path d="M81.5139 62.7686C104.205 62.7686 97.1139 36.7686 120.514 36.7686" stroke="#6E52DF" stroke-width="2"/>
</g>
<defs>
<filter id="filter0_d_5150_67028" x="8" y="46" width="85" height="45" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="6"/>
<feGaussianBlur stdDeviation="6"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.14 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_5150_67028"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_5150_67028" result="shape"/>
</filter>
<filter id="filter1_d_5150_67028" x="106.75" y="23" width="54.25" height="39.125" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="6"/>
<feGaussianBlur stdDeviation="6"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.14 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_5150_67028"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_5150_67028" result="shape"/>
</filter>
<filter id="filter2_d_5150_67028" x="106.75" y="48.8013" width="54.25" height="39.125" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="6"/>
<feGaussianBlur stdDeviation="6"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.14 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_5150_67028"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_5150_67028" result="shape"/>
</filter>
<filter id="filter3_d_5150_67028" x="106.75" y="74.603" width="54.25" height="39.125" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="6"/>
<feGaussianBlur stdDeviation="6"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.14 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_5150_67028"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_5150_67028" result="shape"/>
</filter>
<clipPath id="clip0_5150_67028">
<rect width="170" height="106" fill="white"/>
</clipPath>
</defs>
</svg>
`
