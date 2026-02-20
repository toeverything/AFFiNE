{{- define "common.environment" -}}
{{- .Values.global.app.environment | default .Release.Namespace -}}
{{- end -}}