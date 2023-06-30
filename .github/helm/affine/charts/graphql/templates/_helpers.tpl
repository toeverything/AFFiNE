{{/*
Expand the name of the chart.
*/}}
{{- define "graphql.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "graphql.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "graphql.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "graphql.labels" -}}
helm.sh/chart: {{ include "graphql.chart" . }}
{{ include "graphql.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "graphql.selectorLabels" -}}
app.kubernetes.io/name: {{ include "graphql.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "graphql.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "graphql.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "jwt.key" -}}
{{- $secret := lookup "v1" "Secret" .Release.Namespace .Values.app.jwt.secretName -}}
{{- if and $secret $secret.data.private -}}
{{/*
   Reusing existing secret data
*/}}
key: {{ $secret.data.private }}
{{- else -}}
{{/*
    Generate new data
*/}}
key: {{ genPrivateKey "ecdsa" | b64enc }}
{{- end -}}
{{- end -}}

{{- define "objectStorage.r2" -}}
{{- $secret := lookup "v1" "Secret" .Release.Namespace .Values.app.objectStorage.r2.secretName -}}
{{- if $secret -}}
{{/*
   Reusing existing secret data
*/}}
accountId: {{ $secret.data.accountId }}
accessKeyId: {{ $secret.data.accessKeyId }}
secretAccessKey: {{ $secret.data.secretAccessKey }}
bucket: {{ $secret.data.bucket }}
{{- else -}}
{{/*
    Generate new data
*/}}
accountId: {{ .Values.app.objectStorage.r2.accountId | b64enc }}
accessKeyId: {{ .Values.app.objectStorage.r2.accessKeyId | b64enc }}
secretAccessKey: {{ .Values.app.objectStorage.r2.secretAccessKey | b64enc }}
bucket: {{ .Values.app.objectStorage.r2.bucket | b64enc }}
{{- end -}}
{{- end -}}

{{- define "objectStorage.oauth.google" -}}
{{- $secret := lookup "v1" "Secret" .Release.Namespace .Values.app.oauth.google.secretName -}}
{{- if $secret -}}
{{/*
   Reusing existing secret data
*/}}
clientId: {{ $secret.data.clientId }}
clientSecret: {{ $secret.data.clientSecret }}
{{- else -}}
{{/*
    Generate new data
*/}}
clientId: "{{ .Values.app.oauth.google.clientId | b64enc }}"
clientSecret: "{{ .Values.app.oauth.google.clientSecret | b64enc }}"
{{- end -}}
{{- end -}}

{{- define "objectStorage.oauth.github" -}}
{{- $secret := lookup "v1" "Secret" .Release.Namespace .Values.app.oauth.github.secretName -}}
{{- if $secret -}}
{{/*
   Reusing existing secret data
*/}}
clientId: {{ $secret.data.clientId }}
clientSecret: {{ $secret.data.clientSecret }}
{{- else -}}
{{/*
    Generate new data
*/}}
clientId: "{{ .Values.app.oauth.github.clientId | b64enc }}"
clientSecret: "{{ .Values.app.oauth.github.clientSecret | b64enc }}"
{{- end -}}
{{- end -}}
