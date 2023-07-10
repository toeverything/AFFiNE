/* eslint-disable */
//prettier-ignore
module.exports = {
name: "@yarnpkg/plugin-after-install",
factory: function (require) {
var plugin=(()=>{var g=Object.create,r=Object.defineProperty;var x=Object.getOwnPropertyDescriptor;var C=Object.getOwnPropertyNames;var k=Object.getPrototypeOf,y=Object.prototype.hasOwnProperty;var I=t=>r(t,"__esModule",{value:!0});var i=t=>{if(typeof require!="undefined")return require(t);throw new Error('Dynamic require of "'+t+'" is not supported')};var h=(t,o)=>{for(var e in o)r(t,e,{get:o[e],enumerable:!0})},w=(t,o,e)=>{if(o&&typeof o=="object"||typeof o=="function")for(let n of C(o))!y.call(t,n)&&n!=="default"&&r(t,n,{get:()=>o[n],enumerable:!(e=x(o,n))||e.enumerable});return t},a=t=>w(I(r(t!=null?g(k(t)):{},"default",t&&t.__esModule&&"default"in t?{get:()=>t.default,enumerable:!0}:{value:t,enumerable:!0})),t);var j={};h(j,{default:()=>b});var c=a(i("@yarnpkg/core")),m={afterInstall:{description:"Hook that will always run after install",type:c.SettingsType.STRING,default:""}};var u=a(i("clipanion")),d=a(i("@yarnpkg/core"));var p=a(i("@yarnpkg/shell")),l=async(t,o)=>{var f;let e=t.get("afterInstall"),n=!!((f=t.projectCwd)==null?void 0:f.endsWith(`dlx-${process.pid}`));return e&&!n?(o&&console.log("Running `afterInstall` hook..."),(0,p.execute)(e,[],{cwd:t.projectCwd||void 0})):0};var s=class extends u.Command{async execute(){let o=await d.Configuration.find(this.context.cwd,this.context.plugins);return l(o,!1)}};s.paths=[["after-install"]];var P={configuration:m,commands:[s],hooks:{afterAllInstalled:async t=>{if(await l(t.configuration,!0))throw new Error("The `afterInstall` hook failed, see output above.")}}},b=P;return j;})();
return plugin;
}
};
