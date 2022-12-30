export async function newPage(page) {
  return page.getByTestId('sliderBar').getByText('New Page').click();
}
