# MultiJuicer Monitoring Setups

This is a short and temporary guide on how to install MultiJuicer together with Prometheus, Grafana & Grafana Loki to get nice monitoring setup for your MultiJuicer installation.

After you have everything installed you can locally port forward the grafana port by running: `kubectl -n monitoring port-forward service/monitoring-grafana 8080:80` and access Grafana in your browser on [http://localhost:8080](http://localhost:8080). The default admin password for the Grafana Setup is: `prom-operator`. You can overwrite this by adding `set="grafana.adminPassword=yourPasswordHere"` to the helm install command for the prometheus-operator.

```sh
# Install Prometheus, Grafana & Grafana Loki

helm repo add grafana https://grafana.github.io/helm-charts
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts

kubectl create namespace monitoring

echo "Installing prometheus-operator"
wget https://raw.githubusercontent.com/juice-shop/multi-juicer/main/guides/monitoring-setup/prometheus-operator-config.yaml

echo "Installing Prometheus Operator & Grafana"
helm --namespace monitoring upgrade --install monitoring prometheus-community/kube-prometheus-stack --version 65.5.1 --values prometheus-operator-config.yaml

echo "Getting loki configuration"
# The default loki config is set to monolithic single replica. If more redundancy is needed you can reconfigure it to your liking. https://grafana.com/docs/loki/latest/setup/install/helm/concepts/
wget https://raw.githubusercontent.com/juice-shop/multi-juicer/main/guides/monitoring-setup/loki-monitoring-config.yaml

echo "Installing loki"
helm --namespace monitoring upgrade --install loki grafana/loki --version 6.18.0 --values loki-monitoring-config.yaml

echo "Installing loki/promtail"
helm --namespace monitoring upgrade --install promtail grafana/promtail --version 6.16.6 --set="serviceMonitor.enabled=true" --set="config.clients[0].url=http://loki-gateway/loki/api/v1/push,config.clients[0].tenant_id=multijuicer" --set="config.snippets.extraRelabelConfigs[0].action=labelmap,config.snippets.extraRelabelConfigs[0].regex=__meta_kubernetes_pod_label_(team)"

echo "Installing MultiJuicer"
helm install multi-juicer oci://ghcr.io/juice-shop/multi-juicer/helm/multi-juicer --set="balancer.metrics.enabled=true" --set="balancer.metrics.dashboards.enabled=true" --set="balancer.metrics.serviceMonitor.enabled=true"
```
