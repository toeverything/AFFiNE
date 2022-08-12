const svgr = require('@svgr/core');
const util = require('./util');

function getColors(colorCount) {
    return colorCount > 0
        ? Array(colorCount)
              .fill(0)
              .reduce((acc, _, index) => {
                  acc.push({
                      type: 'string',
                      value: `--color-${index}`,
                      propName: `color${index}`,
                  });

                  if (index === 0) {
                      acc.push({
                          type: 'string',
                          value: `--color-${index}`,
                          propName: 'primaryColor',
                      });
                  }

                  if (index === 1) {
                      acc.push({
                          type: 'string',
                          value: `--color-${index}`,
                          propName: 'secondaryColor',
                      });
                  }
                  return acc;
              }, [])
        : [
              {
                  type: 'string',
                  value: 'color',
                  propName: 'color',
              },
          ];
}

function getColorsInterfaceProps(colors) {
    return colors
        .map(color => {
            return `${color.propName}?: ${color.type}`;
        })
        .join('\n    ');
}

function getRestColors(colors) {
    return colors.map(color => color.propName).join(', ');
}

function getPropNameToColorValue(colors) {
    const maps = colors.reduce((acc, color) => {
        if (acc[color.value]) {
            acc[color.value] = `${acc[color.value]} || ${color.propName}`;
        } else {
            acc[color.value] = color.propName;
        }
        return acc;
    }, {});
    const kvString = Object.entries(maps)
        .map(kv => {
            return `"${kv[0]}": ${kv[1]}`;
        })
        .join(', ');
    return `{${kvString}}`;
}

/**
 * get icon component template
 *
 * @param {string} name
 * @param {string} svgCode svg original code
 * @param {Object} customStyles custom style properties
 */
module.exports = async function generateReactIcon(name, svgCode, customStyles) {
    let svgrContent = '';
    try {
        svgrContent = await svgr.transform(
            svgCode,
            {
                icon: true,
                typescript: true,
            },
            { componentName: `${name}Icon1` }
        );
    } catch (err) {
        console.error(err);
    }
    let svgContent = svgrContent.match(/<svg [^\>]+>([\s\S]*?)<\/svg>/)[1];

    let colorIdx = 0;
    if (util.isDuotone(name)) {
        svgContent = svgContent.replace(
            /fill="#[A-Za-z0-9]+"/g,
            () => `style={{fill: 'var(--color-${colorIdx++})'}}`
        );
    }
    const colors = getColors(colorIdx);

    return `
// eslint-disable-next-line no-restricted-imports
import { SvgIcon, SvgIconProps } from '@mui/material';

export interface ${name}IconProps extends Omit<SvgIconProps, 'color'> {
    ${getColorsInterfaceProps(colors)}
}

export const ${name}Icon = ({ ${getRestColors(
        colors
    )}, style, ...props}: ${name}IconProps) => {
    const propsStyles = ${getPropNameToColorValue(colors)};
    const customStyles = ${JSON.stringify(customStyles || {})};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        ${svgContent}
        </SvgIcon>
    )
};
`;
};
