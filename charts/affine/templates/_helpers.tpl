{{- define "affine.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

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

{{- define "affine.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "affine.labels" -}}
helm.sh/chart: {{ include "affine.chart" . }}
{{ include "affine.selectorLabels" . }}
app.kubernetes.io/version: {{ .Values.image.tag | default .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "affine.selectorLabels" -}}
app.kubernetes.io/name: {{ include "affine.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "affine.env" -}}
{{- if .Values.existingSecret }}
envFrom:
  - secretRef:
      name: {{ .Values.existingSecret }}
{{- else }}
env:
  {{- range $key, $value := .Values.env }}
  - name: {{ $key }}
    value: {{ $value | quote }}
  {{- end }}
{{- end }}
{{- end }}

{{- define "affine.hasConfig" -}}
{{- if and .Values.config (gt (len .Values.config) 0) -}}true{{- end -}}
{{- end }}

{{- define "affine.volumes" -}}
{{- if .Values.persistence.enabled }}
- name: storage
  persistentVolumeClaim:
    claimName: {{ include "affine.fullname" . }}
{{- end }}
{{- if include "affine.hasConfig" . }}
- name: config
  configMap:
    name: {{ include "affine.fullname" . }}
{{- end }}
{{- end }}

{{- define "affine.volumeMounts" -}}
{{- if .Values.persistence.enabled }}
- name: storage
  mountPath: /root/.affine/storage
{{- end }}
{{- if include "affine.hasConfig" . }}
- name: config
  mountPath: /root/.affine/config
  readOnly: true
{{- end }}
{{- end }}

{{- define "affine.migrationVolumes" -}}
{{- if include "affine.hasConfig" . }}
- name: config
  configMap:
    name: {{ include "affine.fullname" . }}
{{- end }}
{{- end }}

{{- define "affine.migrationVolumeMounts" -}}
{{- if include "affine.hasConfig" . }}
- name: config
  mountPath: /root/.affine/config
  readOnly: true
{{- end }}
{{- end }}

{{- define "affine.hasVolumes" -}}
{{- if or .Values.persistence.enabled (include "affine.hasConfig" .) -}}true{{- end -}}
{{- end }}

{{- define "affine.hasMigrationVolumes" -}}
{{- include "affine.hasConfig" . -}}
{{- end }}
