import { type Path, ProjectRoot } from '@affine-tools/utils/path';

import { Command, Option } from './command';

const CERT_DIR = ProjectRoot.join('.docker/dev/certs');
const CA_DIR = CERT_DIR.join('ca');
const TEMPLATES_DIR = ProjectRoot.join('.docker/dev/templates');
const NGINX_CONF_DIR = ProjectRoot.join('.docker/dev/nginx/conf.d');
const CA_PEM_PATH = CA_DIR.join('affine-self-signed.pem');
const CA_KEY_PATH = CA_DIR.join('affine-self-signed.key');

const CA_ORG = 'AFFiNE Dev CA Self Signed Org';
const CA_NAME = 'AFFiNE Dev CA Self Signed CN';

export class CertCommand extends Command {
  static override paths = [['cert']];

  install = Option.Boolean('--install', {
    description: 'Install the CA',
  });

  domain = Option.String('--domain', {
    description:
      'Generate certificates for given domain. e.g. "affine.localhost"',
  });

  uninstall = Option.Boolean('--uninstall', {
    description: 'Uninstall the CA',
  });

  async execute() {
    if (this.install) {
      this.installCa();
    } else if (this.uninstall) {
      this.uninstallCa(CA_PEM_PATH);
    } else if (this.domain) {
      this.createCert(this.domain);
    }
  }

  private createCert(domain: string) {
    if (!this.checkInstalled(CA_PEM_PATH)) {
      this.logger.error(
        'CA not installed. Please run `yarn affine cert --install` first.'
      );
      process.exit(1);
    }

    const domainDir = CERT_DIR.join(domain);
    domainDir.rm({ recursive: true });
    domainDir.mkdir();
    NGINX_CONF_DIR.mkdir();

    const keyPath = domainDir.join('key');
    const crtPath = domainDir.join('crt');
    const csrPath = domainDir.join('csr');
    const confPath = domainDir.join('conf');
    const nginxConfPath = NGINX_CONF_DIR.join(`${domain}.conf`);

    const configTemp = TEMPLATES_DIR.join('openssl.conf')
      .readAsFile()
      .toString('utf-8');
    const config = configTemp.replaceAll('DEV_DOMAIN', domain);

    confPath.writeFile(config);
    this.exec(`openssl genrsa -out ${keyPath} 2048`);
    this.exec(
      `openssl req -new -key ${keyPath} -out ${csrPath} -config ${confPath} -subj "/C=/ST=/O=/localityName=/commonName=${domain}/organizationalUnitName=/emailAddress=${domain}@affine.pro/"`
    );
    this.exec(
      `openssl x509 -req -days 1024 -in ${csrPath} -CA ${CA_PEM_PATH} -CAkey ${CA_KEY_PATH} -CAcreateserial -out ${crtPath} -extensions v3_req -extfile ${confPath}`
    );

    const nginxConfTemp = TEMPLATES_DIR.join('nginx.conf')
      .readAsFile()
      .toString('utf-8');
    const nginxConf = nginxConfTemp.replaceAll('DEV_DOMAIN', domain);
    nginxConfPath.writeFile(nginxConf);
  }

  private installCa() {
    if (this.checkInstalled(CA_PEM_PATH)) {
      return;
    }

    // remove old ca
    CA_PEM_PATH.rm();
    CA_KEY_PATH.rm();
    CA_DIR.mkdir();

    this.exec(
      `openssl req -new -newkey rsa:2048 -days 1024 -nodes -x509 -subj "/C=/ST=/O=${CA_ORG}/localityName=/commonName=${CA_NAME}/organizationalUnitName=Developers/emailAddress=dev@affine.pro/" -keyout ${CA_KEY_PATH} -out ${CA_PEM_PATH}`
    );
    this.trustCa(CA_PEM_PATH);
  }

  private trustCa(pem: Path) {
    this.logger.info(`Trusting AFFiNE Dev Self Signed CA`);
    this.exec(
      `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ${pem}`
    );
  }

  private uninstallCa(pem: Path) {
    if (!this.checkInstalled(pem)) {
      this.logger.error('CA not installed');
      return;
    }

    this.exec(
      `sudo security delete-certificate -c ${CA_NAME} /Library/Keychains/System.keychain`
    );
  }

  private checkInstalled(pem: Path) {
    if (!pem.exists()) {
      return false;
    }

    const ret = this.exec(`security verify-cert -c ${pem}`);

    return ret.includes('...certificate verification successful.');
  }
}
