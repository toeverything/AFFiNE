import { FontFamily, FontStyle, FontWeight } from '@blocksuite/affine-model';
import { z } from 'zod';

export const fontConfigSchema = z.object({
  font: z.string(),
  weight: z.string(),
  url: z.string(),
  style: z.string(),
});

export type FontConfig = z.infer<typeof fontConfigSchema>;

export const AffineCanvasTextFonts: FontConfig[] = [
  // Inter, https://fonts.cdnfonts.com/css/inter?styles=29139,29134,29135,29136,29140,29141
  {
    font: FontFamily.Inter,
    url: 'https://cdn.affine.pro/fonts/Inter-Light-BETA.woff2',
    weight: FontWeight.Light,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Inter,
    url: 'https://cdn.affine.pro/fonts/Inter-Regular.woff2',
    weight: FontWeight.Regular,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Inter,
    url: 'https://cdn.affine.pro/fonts/Inter-SemiBold.woff2',
    weight: FontWeight.SemiBold,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Inter,
    url: 'https://cdn.affine.pro/fonts/Inter-LightItalic-BETA.woff2',
    weight: FontWeight.Light,
    style: FontStyle.Italic,
  },
  {
    font: FontFamily.Inter,
    url: 'https://cdn.affine.pro/fonts/Inter-Italic.woff2',
    weight: FontWeight.Regular,
    style: FontStyle.Italic,
  },
  {
    font: FontFamily.Inter,
    url: 'https://cdn.affine.pro/fonts/Inter-SemiBoldItalic.woff2',
    weight: FontWeight.SemiBold,
    style: FontStyle.Italic,
  },
  // Kalam, https://fonts.cdnfonts.com/css/kalam?styles=15166,170689,170687
  {
    font: FontFamily.Kalam,
    url: 'https://cdn.affine.pro/fonts/Kalam-Light.woff2',
    weight: FontWeight.Light,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Kalam,
    url: 'https://cdn.affine.pro/fonts/Kalam-Regular.woff2',
    weight: FontWeight.Regular,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Kalam,
    url: 'https://cdn.affine.pro/fonts/Kalam-Bold.woff2',
    weight: FontWeight.SemiBold,
    style: FontStyle.Normal,
  },
  // Satoshi, https://fonts.cdnfonts.com/css/satoshi?styles=135009,135004,135005,135006,135002,135003
  {
    font: FontFamily.Satoshi,
    url: 'https://cdn.affine.pro/fonts/Satoshi-Light.woff2',
    weight: FontWeight.Light,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Satoshi,
    url: 'https://cdn.affine.pro/fonts/Satoshi-Regular.woff2',
    weight: FontWeight.Regular,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Satoshi,
    url: 'https://cdn.affine.pro/fonts/Satoshi-Bold.woff2',
    weight: FontWeight.SemiBold,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Satoshi,
    url: 'https://cdn.affine.pro/fonts/Satoshi-LightItalic.woff2',
    weight: FontWeight.Light,
    style: FontStyle.Italic,
  },
  {
    font: FontFamily.Satoshi,
    url: 'https://cdn.affine.pro/fonts/Satoshi-Italic.woff2',
    weight: FontWeight.Regular,
    style: FontStyle.Italic,
  },
  {
    font: FontFamily.Satoshi,
    url: 'https://cdn.affine.pro/fonts/Satoshi-BoldItalic.woff2',
    weight: FontWeight.SemiBold,
    style: FontStyle.Italic,
  },
  // Poppins, https://fonts.cdnfonts.com/css/poppins?styles=20394,20389,20390,20391,20395,20396
  {
    font: FontFamily.Poppins,
    url: 'https://cdn.affine.pro/fonts/Poppins-Light.woff2',
    weight: FontWeight.Light,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Poppins,
    url: 'https://cdn.affine.pro/fonts/Poppins-Regular.woff2',
    weight: FontWeight.Regular,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Poppins,
    url: 'https://cdn.affine.pro/fonts/Poppins-Medium.woff2',
    weight: FontWeight.Medium,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Poppins,
    url: 'https://cdn.affine.pro/fonts/Poppins-SemiBold.woff2',
    weight: FontWeight.SemiBold,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Poppins,
    url: 'https://cdn.affine.pro/fonts/Poppins-LightItalic.woff2',
    weight: FontWeight.Light,
    style: FontStyle.Italic,
  },
  {
    font: FontFamily.Poppins,
    url: 'https://cdn.affine.pro/fonts/Poppins-Italic.woff2',
    weight: FontWeight.Regular,
    style: FontStyle.Italic,
  },
  {
    font: FontFamily.Poppins,
    url: 'https://cdn.affine.pro/fonts/Poppins-SemiBoldItalic.woff2',
    weight: FontWeight.SemiBold,
    style: FontStyle.Italic,
  },
  // Lora, https://fonts.cdnfonts.com/css/lora-4?styles=50357,50356,50354,50355
  {
    font: FontFamily.Lora,
    url: 'https://cdn.affine.pro/fonts/Lora-Regular.woff2',
    weight: FontWeight.Regular,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Lora,
    url: 'https://cdn.affine.pro/fonts/Lora-Bold.woff2',
    weight: FontWeight.SemiBold,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Lora,
    url: 'https://cdn.affine.pro/fonts/Lora-Italic.woff2',
    weight: FontWeight.Regular,
    style: FontStyle.Italic,
  },
  {
    font: FontFamily.Lora,
    url: 'https://cdn.affine.pro/fonts/Lora-BoldItalic.woff2',
    weight: FontWeight.SemiBold,
    style: FontStyle.Italic,
  },
  // BebasNeue, https://fonts.cdnfonts.com/css/bebas-neue?styles=169713,17622,17620
  {
    font: FontFamily.BebasNeue,
    url: 'https://cdn.affine.pro/fonts/BebasNeue-Light.woff2',
    weight: FontWeight.Light,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.BebasNeue,
    url: 'https://cdn.affine.pro/fonts/BebasNeue-Regular.woff2',
    weight: FontWeight.Regular,
    style: FontStyle.Normal,
  },
  // OrelegaOne, https://fonts.cdnfonts.com/css/orelega-one?styles=148618
  {
    font: FontFamily.OrelegaOne,
    url: 'https://cdn.affine.pro/fonts/OrelegaOne-Regular.woff2',
    weight: FontWeight.Regular,
    style: FontStyle.Normal,
  },
];

export const CommunityCanvasTextFonts: FontConfig[] = [
  // Inter, https://fonts.cdnfonts.com/css/inter?styles=29139,29134,29135,29136,29140,29141
  {
    font: FontFamily.Inter,
    url: 'https://fonts.cdnfonts.com/s/19795/Inter-Light-BETA.woff',
    weight: FontWeight.Light,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Inter,
    url: 'https://fonts.cdnfonts.com/s/19795/Inter-Regular.woff',
    weight: FontWeight.Regular,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Inter,
    url: 'https://fonts.cdnfonts.com/s/19795/Inter-SemiBold.woff',
    weight: FontWeight.SemiBold,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Inter,
    url: 'https://fonts.cdnfonts.com/s/19795/Inter-LightItalic-BETA.woff',
    weight: FontWeight.Light,
    style: FontStyle.Italic,
  },
  {
    font: FontFamily.Inter,
    url: 'https://fonts.cdnfonts.com/s/19795/Inter-Italic.woff',
    weight: FontWeight.Regular,
    style: FontStyle.Italic,
  },
  {
    font: FontFamily.Inter,
    url: 'https://fonts.cdnfonts.com/s/19795/Inter-SemiBoldItalic.woff',
    weight: FontWeight.SemiBold,
    style: FontStyle.Italic,
  },
  // Kalam, https://fonts.cdnfonts.com/css/kalam?styles=15166,170689,170687
  {
    font: FontFamily.Kalam,
    url: 'https://fonts.cdnfonts.com/s/13130/Kalam-Light.woff',
    weight: FontWeight.Light,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Kalam,
    url: 'https://fonts.cdnfonts.com/s/13130/Kalam-Regular.woff',
    weight: FontWeight.Regular,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Kalam,
    url: 'https://fonts.cdnfonts.com/s/13130/Kalam-Bold.woff',
    weight: FontWeight.SemiBold,
    style: FontStyle.Normal,
  },
  // Satoshi, https://fonts.cdnfonts.com/css/satoshi?styles=135009,135004,135005,135006,135002,135003
  {
    font: FontFamily.Satoshi,
    url: 'https://fonts.cdnfonts.com/s/85546/Satoshi-Light.woff',
    weight: FontWeight.Light,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Satoshi,
    url: 'https://fonts.cdnfonts.com/s/85546/Satoshi-Regular.woff',
    weight: FontWeight.Regular,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Satoshi,
    url: 'https://fonts.cdnfonts.com/s/85546/Satoshi-Bold.woff',
    weight: FontWeight.SemiBold,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Satoshi,
    url: 'https://fonts.cdnfonts.com/s/85546/Satoshi-LightItalic.woff',
    weight: FontWeight.Light,
    style: FontStyle.Italic,
  },
  {
    font: FontFamily.Satoshi,
    url: 'https://fonts.cdnfonts.com/s/85546/Satoshi-Italic.woff',
    weight: FontWeight.Regular,
    style: FontStyle.Italic,
  },
  {
    font: FontFamily.Satoshi,
    url: 'https://fonts.cdnfonts.com/s/85546/Satoshi-BoldItalic.woff',
    weight: FontWeight.SemiBold,
    style: FontStyle.Italic,
  },
  // Poppins, https://fonts.cdnfonts.com/css/poppins?styles=20394,20389,20390,20391,20395,20396
  {
    font: FontFamily.Poppins,
    url: 'https://fonts.cdnfonts.com/s/16009/Poppins-Light.woff',
    weight: FontWeight.Light,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Poppins,
    url: 'https://fonts.cdnfonts.com/s/16009/Poppins-Regular.woff',
    weight: FontWeight.Regular,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Poppins,
    url: 'https://fonts.cdnfonts.com/s/16009/Poppins-Medium.woff',
    weight: FontWeight.Medium,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Poppins,
    url: 'https://fonts.cdnfonts.com/s/16009/Poppins-SemiBold.woff',
    weight: FontWeight.SemiBold,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Poppins,
    url: 'https://fonts.cdnfonts.com/s/16009/Poppins-LightItalic.woff',
    weight: FontWeight.Light,
    style: FontStyle.Italic,
  },
  {
    font: FontFamily.Poppins,
    url: 'https://fonts.cdnfonts.com/s/16009/Poppins-Italic.woff',
    weight: FontWeight.Regular,
    style: FontStyle.Italic,
  },
  {
    font: FontFamily.Poppins,
    url: 'https://fonts.cdnfonts.com/s/16009/Poppins-SemiBoldItalic.woff',
    weight: FontWeight.SemiBold,
    style: FontStyle.Italic,
  },
  // Lora, https://fonts.cdnfonts.com/css/lora-4?styles=50357,50356,50354,50355
  {
    font: FontFamily.Lora,
    url: 'https://fonts.cdnfonts.com/s/29883/Lora-Regular.woff',
    weight: FontWeight.Regular,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Lora,
    url: 'https://fonts.cdnfonts.com/s/29883/Lora-Bold.woff',
    weight: FontWeight.SemiBold,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.Lora,
    url: 'https://fonts.cdnfonts.com/s/29883/Lora-Italic.woff',
    weight: FontWeight.Regular,
    style: FontStyle.Italic,
  },
  {
    font: FontFamily.Lora,
    url: 'https://fonts.cdnfonts.com/s/29883/Lora-BoldItalic.woff',
    weight: FontWeight.SemiBold,
    style: FontStyle.Italic,
  },
  // BebasNeue, https://fonts.cdnfonts.com/css/bebas-neue?styles=169713,17622,17620
  {
    font: FontFamily.BebasNeue,
    url: 'https://fonts.cdnfonts.com/s/14902/BebasNeue%20Light.woff',
    weight: FontWeight.Light,
    style: FontStyle.Normal,
  },
  {
    font: FontFamily.BebasNeue,
    url: 'https://fonts.cdnfonts.com/s/14902/BebasNeue-Regular.woff',
    weight: FontWeight.Regular,
    style: FontStyle.Normal,
  },
  // OrelegaOne, https://fonts.cdnfonts.com/css/orelega-one?styles=148618
  {
    font: FontFamily.OrelegaOne,
    url: 'https://fonts.cdnfonts.com/s/93179/OrelegaOne-Regular.woff',
    weight: FontWeight.Regular,
    style: FontStyle.Normal,
  },
];
