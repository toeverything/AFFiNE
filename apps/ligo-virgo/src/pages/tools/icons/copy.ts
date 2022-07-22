const create_fake_element = (value: string) => {
    const fake_element = document.createElement('textarea');
    fake_element.style.position = 'fixed';
    fake_element.style.top = '0';
    fake_element.style.clipPath = "path('M0,0 L0,0')";
    fake_element.setAttribute('readonly', '');
    fake_element.value = value;
    return fake_element;
};

export const copy = (value: string) => {
    const fake_element = create_fake_element(value);
    document.body.appendChild(fake_element);
    fake_element.select();
    fake_element.setSelectionRange(0, fake_element.value.length);
    document.execCommand('copy');
    fake_element.remove();
};
