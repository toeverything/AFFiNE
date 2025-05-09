import { Global, Injectable, Module } from '@nestjs/common';
import {
  DiscoveryModule,
  DiscoveryService,
  MetadataScanner,
} from '@nestjs/core';
import { RESOLVER_TYPE_METADATA } from '@nestjs/graphql';

@Injectable()
export class ModuleScanner {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner
  ) {}

  getClassProviders() {
    return this.discovery
      .getProviders()
      .filter(
        wrapper =>
          wrapper.instance && !wrapper.isAlias && !wrapper.isNotMetatype
      );
  }

  getAtInjectables() {
    return this.getClassProviders().filter(
      wrapper => !this.isResolver(wrapper.instance)
    );
  }

  getControllers() {
    return this.discovery.getControllers();
  }

  getResolvers() {
    return this.getClassProviders().filter(wrapper =>
      this.isResolver(wrapper.instance)
    );
  }

  getAllMethodNames(instance: any) {
    return this.scanner.getAllMethodNames(Object.getPrototypeOf(instance));
  }

  isResolver(instance: any) {
    if (typeof instance !== 'object') {
      return false;
    }
    const metadata = Reflect.getMetadata(RESOLVER_TYPE_METADATA, instance);
    return metadata !== undefined;
  }
}

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [ModuleScanner],
  exports: [ModuleScanner],
})
export class ScannerModule {}
