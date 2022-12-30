export async function newPage(page) {
  return page.getByTestId('sliderBar').getByText('New Page').click();
}

export async function clickPageMoreActions(page) {
  return page
    .getByTestId('editor-header-items')
    .getByRole('button')
    .nth(1)
    .click();
}
