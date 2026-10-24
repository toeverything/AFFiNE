{{/*
Expand the name of the chart.
*/}}
{{- define "affine.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "affine.fullname" -}}
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
{{- define "affine.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "affine.labels" -}}
helm.sh/chart: {{ include "affine.chart" . }}
{{ include "affine.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "affine.selectorLabels" -}}
app.kubernetes.io/name: {{ include "affine.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "affine.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "affine.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Render the server runtime configuration shared by the Secret and Pod checksums.
*/}}
{{- define "affine.serverConfig" -}}
{{- $config := deepCopy (required "global.serverConfig is required" .root.Values.global.serverConfig) -}}
{{- if ne (dig "deployment" "type" "" $config) "cloud" -}}
{{- fail "This chart requires deployment.type=cloud" -}}
{{- end -}}
{{- if not (hasKey $config "server") -}}
{{- $_ := set $config "server" dict -}}
{{- end -}}
{{- $_ := set $config.server "port" .port -}}
{{- $config | toJson -}}
{{- end }}
