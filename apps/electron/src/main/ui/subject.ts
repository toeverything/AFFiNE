import { Subject } from 'rxjs';

export const uiSubjects = {
  onStartLogin: new Subject<{ email?: string }>(),
  onFinishLogin: new Subject<{ success: boolean; email?: string }>(),
};
