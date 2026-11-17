import { installNestedDatabaseFullWidthGuard } from './database-override';
import { DatabaseRefBlockComponent } from './database-ref-block';
import { installDatabaseRefCascadeDelete } from './delete-guard';

export function effects() {
  customElements.define('affine-database-ref', DatabaseRefBlockComponent);
  installDatabaseRefCascadeDelete();
  installNestedDatabaseFullWidthGuard();
}
