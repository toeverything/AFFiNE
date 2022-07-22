interface SelectProps {
    label?: string;
    value?: string;
    options?: string[];
    onChange?(evn: React.ChangeEvent<HTMLSelectElement>): void;
}

export const Select = ({
    label = '',
    value,
    options = [],
    onChange,
}: SelectProps) => {
    return (
        <label>
            {label && <span>{label}：</span>}
            <span>
                <select value={value} onChange={onChange}>
                    {options.map((item, key) => {
                        const optionProps: React.OptionHTMLAttributes<HTMLOptionElement> =
                            {};
                        if (value === item) {
                            optionProps.value = item;
                        }
                        return (
                            <option key={key} {...optionProps}>
                                {item}
                            </option>
                        );
                    })}
                </select>
            </span>
        </label>
    );
};
