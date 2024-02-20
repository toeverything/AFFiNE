import type { Page } from '@toeverything/infra';
import { LiveData } from '@toeverything/infra/livedata';

/**
 * service to manage current page
 */
export class CurrentPageService {
  currentPage = new LiveData<Page | null>(null);

  /**
   * open page, current page will be set to the page
   * @param page
   */
  openPage(page: Page) {
    this.currentPage.next(page);
  }

  /**
   * close current page, current page will be null
   */
  closePage() {
    this.currentPage.next(null);
  }
}
