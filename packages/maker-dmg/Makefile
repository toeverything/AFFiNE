# Makefile for Cowsay

PACKAGE_TARNAME = create-dmg

prefix = /usr/local
exec_prefix = ${prefix}
bindir = ${exec_prefix}/bin
datarootdir = ${prefix}/share
datadir = ${datarootdir}
docdir = ${datarootdir}/doc/${PACKAGE_TARNAME}
sysconfdir = ${prefix}/etc
mandir=${datarootdir}/man
srcdir = .

SHELL = /bin/sh
INSTALL = install
INSTALL_PROGRAM = $(INSTALL)
INSTALL_DATA = ${INSTALL} -m 644

.PHONY: install uninstall

install: create-dmg
	$(INSTALL) -d $(DESTDIR)$(prefix)
	$(INSTALL) -d $(DESTDIR)$(bindir)
	$(INSTALL_PROGRAM) create-dmg $(DESTDIR)$(bindir)/create-dmg
	$(INSTALL) -d $(DESTDIR)$(datadir)/$(PACKAGE_TARNAME)
	cp -R support $(DESTDIR)$(datadir)/$(PACKAGE_TARNAME)
	cp -R examples $(DESTDIR)$(datadir)/$(PACKAGE_TARNAME)
	cp -R tests $(DESTDIR)$(datadir)/$(PACKAGE_TARNAME)

uninstall:
	rm -f $(DESTDIR)$(bindir)/create-dmg
	rm -rf $(DESTDIR)$(datadir)/$(PACKAGE_TARNAME)
