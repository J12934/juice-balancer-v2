const {
  KubeConfig,
  AppsV1Api,
  CoreV1Api,
  CustomObjectsApi,
  PatchUtils,
  RbacAuthorizationV1Api,
} = require('@kubernetes/client-node');
const kc = new KubeConfig();
kc.loadFromCluster();

const k8sAppsApi = kc.makeApiClient(AppsV1Api);
const k8sCoreApi = kc.makeApiClient(CoreV1Api);
const k8sCustomAPI = kc.makeApiClient(CustomObjectsApi);
const k8sRBACAPI = kc.makeApiClient(RbacAuthorizationV1Api);
const awsAccountEnv = process.env.IRSA_ROLE || 'youdidnotprovideanirsarole,goodluck';

const { get } = require('./config');

//used for owner ref, not used now:
// const lodashGet = require('lodash/get');
// const once = require('lodash/once');

//used for owner ref, not used now:
// Gets the Deployment uid for the JuiceBalancer
// This is required to set the JuiceBalancer as owner of the created JuiceShop Instances
// const getJuiceBalancerDeploymentUid = once(async () => {
//   const deployment = await k8sAppsApi.readNamespacedDeployment(
//     'wrongsecrets-balancer',
//     get('namespace')
//   );
//   return lodashGet(deployment, ['body', 'metadata', 'uid'], null);
// });

const createNameSpaceForTeam = async (team) => {
  const namedNameSpace = {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: `t-${team}`,
    },
    labels: {
      name: `t-${team}`,
    },
  };
  k8sCoreApi.createNamespace(namedNameSpace).catch((error) => {
    throw new Error(JSON.stringify(error));
  });
};
module.exports.createNameSpaceForTeam = createNameSpaceForTeam;

const createConfigmapForTeam = async (team) => {
  const configmap = {
    apiVersion: 'v1',
    data: {
      'funny.entry': 'thisIsK8SConfigMap',
    },
    kind: 'ConfigMap',
    metadata: {
      annotations: {},
      name: 'secrets-file',
      namespace: `t-${team}`,
    },
  };
  return k8sCoreApi.createNamespacedConfigMap('t-' + team, configmap).catch((error) => {
    throw new Error(error.response.body.message);
  });
};
module.exports.createConfigmapForTeam = createConfigmapForTeam;

const createSecretsfileForTeam = async (team) => {
  const secret = {
    apiVersion: 'v1',
    data: {
      funnier: 'dGhpcyBpcyBhcGFzc3dvcmQ=',
    },
    kind: 'Secret',
    type: 'Opaque',
    metadata: {
      name: 'funnystuff',
      namespace: `t-${team}`,
    },
  };
  return k8sCoreApi.createNamespacedSecret('t-' + team, secret).catch((error) => {
    throw new Error(error.response.body.message);
  });
};
module.exports.createSecretsfileForTeam = createSecretsfileForTeam;

const createK8sDeploymentForTeam = async ({ team, passcodeHash }) => {
  const deploymentWrongSecretsConfig = {
    metadata: {
      namespace: `t-${team}`,
      name: `t-${team}-wrongsecrets`,
      labels: {
        app: 'wrongsecrets',
        team,
        'deployment-context': get('deploymentContext'),
      },
      annotations: {
        'wrongsecrets-ctf-party/lastRequest': `${new Date().getTime()}`,
        'wrongsecrets-ctf-party/lastRequestReadable': new Date().toString(),
        'wrongsecrets-ctf-party/passcode': passcodeHash,
        'wrongsecrets-ctf-party/challengesSolved': '0',
        'wrongsecrets-ctf-party/challenges': '[]',
      },
      // ...(await getOwnerReference()),
    },
    spec: {
      selector: {
        matchLabels: {
          app: 'wrongsecrets',
          team,
          'deployment-context': get('deploymentContext'),
        },
      },
      template: {
        metadata: {
          labels: {
            app: 'wrongsecrets',
            team,
            'deployment-context': get('deploymentContext'),
          },
        },
        spec: {
          automountServiceAccountToken: false,
          securityContext: {
            runAsUser: 2000,
            runAsGroup: 2000,
            fsGroup: 2000,
          },
          containers: [
            {
              name: 'wrongsecrets',
              //TODO REPLACE HARDCODED BELOW WITH PROPPER GETS: image: `${get('wrongsecrets.image')}:${get('wrongsecrets.tag')}`,
              image: 'jeroenwillemsen/wrongsecrets:1.5.4RC6-no-vault',
              imagePullPolicy: get('wrongsecrets.imagePullPolicy'),
              // resources: get('wrongsecrets.resources'),
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                runAsNonRoot: true,
              },
              env: [
                {
                  name: 'hints_enabled',
                  value: 'false',
                },
                {
                  name: 'ctf_enabled',
                  value: 'true',
                },
                {
                  name: 'ctf_key',
                  value: 'notarealkeyyouknowbutyoumightgetflags',
                },
                {
                  name: 'K8S_ENV',
                  value: 'k8s',
                },
                {
                  name: 'challenge_acht_ctf_to_provide_to_host_value',
                  value: 'provideThisKeyToHostThankyouAlllGoodDoYouLikeRandomLogging?',
                },
                {
                  name: 'SPECIAL_K8S_SECRET',
                  valueFrom: {
                    configMapKeyRef: {
                      name: 'secrets-file',
                      key: 'funny.entry',
                    },
                  },
                },
                {
                  name: 'SPECIAL_SPECIAL_K8S_SECRET',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'funnystuff',
                      key: 'funnier',
                    },
                  },
                },
                ...get('wrongsecrets.env', []),
              ],
              envFrom: get('wrongsecrets.envFrom'),
              ports: [
                {
                  containerPort: 8080,
                },
              ],
              readinessProbe: {
                httpGet: {
                  path: '/actuator/health/readiness',
                  port: 8080,
                },
                initialDelaySeconds: 120,
                timeoutSeconds: 30,
                periodSeconds: 10,
                failureThreshold: 10,
              },
              livenessProbe: {
                httpGet: {
                  path: '/actuator/health/liveness',
                  port: 8080,
                },
                initialDelaySeconds: 90,
                timeoutSeconds: 30,
                periodSeconds: 30,
              },
              resources: {
                requests: {
                  memory: '512Mi',
                  cpu: '200m',
                },
                limits: {
                  memory: '512Mi',
                  cpu: '200m',
                },
              },

              volumeMounts: [
                // {
                //   name: 'wrongsecrets-config',
                //   mountPath: '/wrongsecrets/config/wrongsecrets-ctf-party.yaml',
                //   subPath: 'wrongsecrets-ctf-party.yaml',
                // },
                {
                  mountPath: '/tmp',
                  name: 'cache-volume',
                },
                // ...get('wrongsecrets.volumeMounts', []),
              ],
            },
          ],
          volumes: [
            // {
            //   name: 'wrongsecrets-config',
            //   configMap: {
            //     name: 'wrongsecrets-config',
            //   },
            // },
            {
              name: 'cache-volume',
              emptyDir: {},
            },
            // ...get('wrongsecrets.volumes', []),
          ],
          tolerations: get('wrongsecrets.tolerations'),
          affinity: get('wrongsecrets.affinity'),
          runtimeClassName: get('wrongsecrets.runtimeClassName')
            ? get('wrongsecrets.runtimeClassName')
            : undefined,
        },
      },
    },
  };
  return k8sAppsApi
    .createNamespacedDeployment('t-' + team, deploymentWrongSecretsConfig)
    .catch((error) => {
      throw new Error(error.response.body.message);
    });
};

module.exports.createK8sDeploymentForTeam = createK8sDeploymentForTeam;

//BEGIN AWS
const createAWSSecretsProviderForTeam = async (team) => {
  const secretProviderClass = {
    apiVersion: 'secrets-store.csi.x-k8s.io/v1',
    kind: 'SecretProviderClass',
    metadata: {
      name: 'wrongsecrets-aws-secretsmanager',
      namespace: `t-${team}`,
    },
    spec: {
      provider: 'aws',
      parameters: {
        objects:
          '- objectName: "wrongsecret"\n  objectType: "secretsmanager"\n- objectName: "wrongsecret-2"\n  objectType: "secretsmanager"\n',
      },
    },
  };
  return k8sCustomAPI
    .createNamespacedCustomObject(
      'secrets-store.csi.x-k8s.io',
      'v1',
      `t-${team}`,
      'secretproviderclasses',
      secretProviderClass
    )
    .catch((error) => {
      throw new Error(JSON.stringify(error));
    });
};
module.exports.createAWSSecretsProviderForTeam = createAWSSecretsProviderForTeam;

// kubectl patch sa default -n t-team -v8 -p='{"metadata":{"annotations":{"eks.amazonaws.com/role-arn":"foo"}}}'
//below does not
const patchServiceAccountForTeamForAWS = async (team) => {
  // const patch = {
  //   op: 'add',
  //   path: 'Annotations/eks.amazonaws.com~1role-arn',
  //   value: `${awsAccountEnv}`,
  // };

  // const patch = {
  //   op: 'add',
  //   path: 'Annotations',
  //   value: {'eks.amazonaws.com~1role-arn': `${awsAccountEnv}`,},
  // };
  const patch = {
    metadata: {
      annotations: {
        'eks.amazonaws.com/role-arn': `${awsAccountEnv}`,
      },
    },
  };
  const options = { headers: { 'Content-type': PatchUtils.PATCH_FORMAT_JSON_MERGE_PATCH } };
  /**
   * partially update the specified ServiceAccount
   * @param name name of the ServiceAccount
   * @param namespace object name and auth scope, such as for teams and projects
   * @param body
   * @param pretty If \&#39;true\&#39;, then the output is pretty printed.
   * @param dryRun When present, indicates that modifications should not be persisted. An invalid or unrecognized dryRun directive will result in an error response and no further processing of the request. Valid values are: - All: all dry run stages will be processed
   * @param fieldManager fieldManager is a name associated with the actor or entity that is making these changes. The value must be less than or 128 characters long, and only contain printable characters, as defined by https://golang.org/pkg/unicode/#IsPrint. This field is required for apply requests (application/apply-patch) but optional for non-apply patch types (JsonPatch, MergePatch, StrategicMergePatch).
   * @param fieldValidation fieldValidation instructs the server on how to handle objects in the request (POST/PUT/PATCH) containing unknown or duplicate fields, provided that the &#x60;ServerSideFieldValidation&#x60; feature gate is also enabled. Valid values are: - Ignore: This will ignore any unknown fields that are silently dropped from the object, and will ignore all but the last duplicate field that the decoder encounters. This is the default behavior prior to v1.23 and is the default behavior when the &#x60;ServerSideFieldValidation&#x60; feature gate is disabled. - Warn: This will send a warning via the standard warning response header for each unknown field that is dropped from the object, and for each duplicate field that is encountered. The request will still succeed if there are no other errors, and will only persist the last of any duplicate fields. This is the default when the &#x60;ServerSideFieldValidation&#x60; feature gate is enabled. - Strict: This will fail the request with a BadRequest error if any unknown fields would be dropped from the object, or if any duplicate fields are present. The error returned from the server will contain all unknown and duplicate fields encountered.
   * @param force Force is going to \&quot;force\&quot; Apply requests. It means user will re-acquire conflicting fields owned by other people. Force flag must be unset for non-apply patch requests.
   */
  return k8sCoreApi
    .patchNamespacedServiceAccount(
      'default',
      `t-${team}`,
      patch,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      options
    )
    .catch((error) => {
      throw new Error(JSON.stringify(error));
    });
};
module.exports.patchServiceAccountForTeamForAWS = patchServiceAccountForTeamForAWS;

//todo before AWS completed; kubectl annotate --overwrite sa default -n t-workit1 eks.amazonaws.com/role-arn="$(terraform output -raw irsa_role)"

const createAWSDeploymentForTeam = async ({ team, passcodeHash }) => {
  const deploymentWrongSecretsConfig = {
    metadata: {
      namespace: `t-${team}`,
      name: `t-${team}-wrongsecrets`,
      labels: {
        app: 'wrongsecrets',
        team,
        'deployment-context': get('deploymentContext'),
      },
      annotations: {
        'wrongsecrets-ctf-party/lastRequest': `${new Date().getTime()}`,
        'wrongsecrets-ctf-party/lastRequestReadable': new Date().toString(),
        'wrongsecrets-ctf-party/passcode': passcodeHash,
        'wrongsecrets-ctf-party/challengesSolved': '0',
        'wrongsecrets-ctf-party/challenges': '[]',
      },
      // ...(await getOwnerReference()),
    },
    spec: {
      selector: {
        matchLabels: {
          app: 'wrongsecrets',
          team,
          'deployment-context': get('deploymentContext'),
        },
      },
      template: {
        metadata: {
          labels: {
            app: 'wrongsecrets',
            team,
            'deployment-context': get('deploymentContext'),
          },
        },
        spec: {
          automountServiceAccountToken: false,
          securityContext: {
            runAsUser: 2000,
            runAsGroup: 2000,
            fsGroup: 2000,
          },
          volumes: [
            {
              name: 'secrets-store-inline',
              csi: {
                driver: 'secrets-store.csi.k8s.io',
                readOnly: true,
                volumeAttributes: {
                  secretProviderClass: 'wrongsecrets-aws-secretsmanager',
                },
              },
            },
            {
              name: 'cache-volume',
              emptyDir: {},
            },
          ],
          containers: [
            {
              name: 'wrongsecrets',
              //TODO REPLACE HARDCODED BELOW WITH PROPPER GETS: image: `${get('wrongsecrets.image')}:${get('wrongsecrets.tag')}`,
              image: 'jeroenwillemsen/wrongsecrets:1.5.4RC6-no-vault',
              imagePullPolicy: get('wrongsecrets.imagePullPolicy'),
              // resources: get('wrongsecrets.resources'),
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                runAsNonRoot: true,
              },
              env: [
                {
                  name: 'hints_enabled',
                  value: 'false',
                },
                {
                  name: 'ctf_enabled',
                  value: 'true',
                },
                {
                  name: 'ctf_key',
                  value: 'notarealkeyyouknowbutyoumightgetflags',
                },
                {
                  name: 'K8S_ENV',
                  value: 'aws',
                },
                {
                  name: 'challenge_acht_ctf_to_provide_to_host_value',
                  value: 'provideThisKeyToHostThankyouAlllGoodDoYouLikeRandomLogging?',
                },
                {
                  name: 'SPECIAL_K8S_SECRET',
                  valueFrom: {
                    configMapKeyRef: {
                      name: 'secrets-file',
                      key: 'funny.entry',
                    },
                  },
                },
                {
                  name: 'SPECIAL_SPECIAL_K8S_SECRET',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'funnystuff',
                      key: 'funnier',
                    },
                  },
                },
                ...get('wrongsecrets.env', []),
              ],
              envFrom: get('wrongsecrets.envFrom'),
              ports: [
                {
                  containerPort: 8080,
                },
              ],
              readinessProbe: {
                httpGet: {
                  path: '/actuator/health/readiness',
                  port: 8080,
                },
                initialDelaySeconds: 120,
                timeoutSeconds: 30,
                periodSeconds: 10,
                failureThreshold: 10,
              },
              livenessProbe: {
                httpGet: {
                  path: '/actuator/health/liveness',
                  port: 8080,
                },
                initialDelaySeconds: 90,
                timeoutSeconds: 30,
                periodSeconds: 30,
              },
              resources: {
                requests: {
                  memory: '512Mi',
                  cpu: '200m',
                },
                limits: {
                  memory: '512Mi',
                  cpu: '200m',
                },
              },
              volumeMounts: [
                // {
                //   name: 'wrongsecrets-config',
                //   mountPath: '/wrongsecrets/config/wrongsecrets-ctf-party.yaml',
                //   subPath: 'wrongsecrets-ctf-party.yaml',
                // },
                {
                  mountPath: '/tmp',
                  name: 'cache-volume',
                },
                {
                  name: 'secrets-store-inline',
                  mountPath: '/mnt/secrets-store',
                  readOnly: true,
                },
                // ...get('wrongsecrets.volumeMounts', []),
              ],
            },
          ],
          tolerations: get('wrongsecrets.tolerations'),
          affinity: get('wrongsecrets.affinity'),
          runtimeClassName: get('wrongsecrets.runtimeClassName')
            ? get('wrongsecrets.runtimeClassName')
            : undefined,
        },
      },
    },
  };
  return k8sAppsApi
    .createNamespacedDeployment('t-' + team, deploymentWrongSecretsConfig)
    .catch((error) => {
      throw new Error(error.response.body.message);
    });
};

module.exports.createAWSDeploymentForTeam = createAWSDeploymentForTeam;

//END AWS

const createServiceAccountForWebTop = async (team) => {
  const webtopSA = {
    apiVersion: 'v1',
    kind: 'ServiceAccount',
    metadata: {
      name: 'webtop-sa',
      namespace: `t-${team}`,
    },
  };
  /**
   * create a ServiceAccount
   * @param namespace object name and auth scope, such as for teams and projects
   * @param body
   * @param pretty If \&#39;true\&#39;, then the output is pretty printed.
   * @param dryRun When present, indicates that modifications should not be persisted. An invalid or unrecognized dryRun directive will result in an error response and no further processing of the request. Valid values are: - All: all dry run stages will be processed
   * @param fieldManager fieldManager is a name associated with the actor or entity that is making these changes. The value must be less than or 128 characters long, and only contain printable characters, as defined by https://golang.org/pkg/unicode/#IsPrint.
   * @param fieldValidation fieldValidation instructs the server on how to handle objects in the request (POST/PUT/PATCH) containing unknown or duplicate fields, provided that the &#x60;ServerSideFieldValidation&#x60; feature gate is also enabled. Valid values are: - Ignore: This will ignore any unknown fields that are silently dropped from the object, and will ignore all but the last duplicate field that the decoder encounters. This is the default behavior prior to v1.23 and is the default behavior when the &#x60;ServerSideFieldValidation&#x60; feature gate is disabled. - Warn: This will send a warning via the standard warning response header for each unknown field that is dropped from the object, and for each duplicate field that is encountered. The request will still succeed if there are no other errors, and will only persist the last of any duplicate fields. This is the default when the &#x60;ServerSideFieldValidation&#x60; feature gate is enabled. - Strict: This will fail the request with a BadRequest error if any unknown fields would be dropped from the object, or if any duplicate fields are present. The error returned from the server will contain all unknown and duplicate fields encountered.
   */
  return k8sCoreApi.createNamespacedServiceAccount(`t-${team}`, webtopSA).catch((error) => {
    throw new Error(JSON.stringify(error));
  });
};

module.exports.createServiceAccountForWebTop = createServiceAccountForWebTop;

const createRoleForWebTop = async (team) => {
  const roleDefinitionForWebtop = {
    kind: 'Role',
    apiVersion: 'rbac.authorization.k8s.io/v1',
    metadata: {
      namespace: `t-${team}`,
      name: 'virtualdesktop-team-role',
    },
      rules: [
        {
          apiGroups: [''],
          resources: ['secrets'],
          verbs: ['get', 'list'],
        },
        {
          apiGroups: [''],
          resources: ['configmaps'],
          verbs: ['get', 'list'],
        },
        {
          apiGroups: [''],
          resources: ['pod', 'pods/log'],
          verbs: ['get', 'list', 'watch'],
        },
        {
          apiGroups: ['apps'],
          resources: ['deployment'],
          verbs: ['get', 'list', 'watch'],
        },
      ],
  };
  /**
   * create a Role
   * @param namespace object name and auth scope, such as for teams and projects
   * @param body
   * @param pretty If \&#39;true\&#39;, then the output is pretty printed.
   * @param dryRun When present, indicates that modifications should not be persisted. An invalid or unrecognized dryRun directive will result in an error response and no further processing of the request. Valid values are: - All: all dry run stages will be processed
   * @param fieldManager fieldManager is a name associated with the actor or entity that is making these changes. The value must be less than or 128 characters long, and only contain printable characters, as defined by https://golang.org/pkg/unicode/#IsPrint.
   * @param fieldValidation fieldValidation instructs the server on how to handle objects in the request (POST/PUT/PATCH) containing unknown or duplicate fields, provided that the &#x60;ServerSideFieldValidation&#x60; feature gate is also enabled. Valid values are: - Ignore: This will ignore any unknown fields that are silently dropped from the object, and will ignore all but the last duplicate field that the decoder encounters. This is the default behavior prior to v1.23 and is the default behavior when the &#x60;ServerSideFieldValidation&#x60; feature gate is disabled. - Warn: This will send a warning via the standard warning response header for each unknown field that is dropped from the object, and for each duplicate field that is encountered. The request will still succeed if there are no other errors, and will only persist the last of any duplicate fields. This is the default when the &#x60;ServerSideFieldValidation&#x60; feature gate is enabled. - Strict: This will fail the request with a BadRequest error if any unknown fields would be dropped from the object, or if any duplicate fields are present. The error returned from the server will contain all unknown and duplicate fields encountered.
   */
  return k8sRBACAPI.createNamespacedRole(`t-${team}`, roleDefinitionForWebtop).catch((error) => {
    throw new Error(JSON.stringify(error));
  });
};

module.exports.createRoleForWebTop = createRoleForWebTop;

const createRoleBindingForWebtop = async (team) => {
  const roleBindingforWebtop = {
    kind: 'RoleBinding',
    metadata: {
      name: 'virtualdesktop-team-rolebinding',
      namespace: `t-${team}`,
    },
    subjects: [{ kind: 'ServiceAccount', name: 'webtop-sa', namespace: `t-${team}` }],
    roleRef: {
      kind: 'Role',
      name: 'virtualdesktop-team-role',
      apiGroup: 'rbac.authorization.k8s.io',
    },
  };
  /**
   * create a RoleBinding
   * @param namespace object name and auth scope, such as for teams and projects
   * @param body
   * @param pretty If \&#39;true\&#39;, then the output is pretty printed.
   * @param dryRun When present, indicates that modifications should not be persisted. An invalid or unrecognized dryRun directive will result in an error response and no further processing of the request. Valid values are: - All: all dry run stages will be processed
   * @param fieldManager fieldManager is a name associated with the actor or entity that is making these changes. The value must be less than or 128 characters long, and only contain printable characters, as defined by https://golang.org/pkg/unicode/#IsPrint.
   * @param fieldValidation fieldValidation instructs the server on how to handle objects in the request (POST/PUT/PATCH) containing unknown or duplicate fields, provided that the &#x60;ServerSideFieldValidation&#x60; feature gate is also enabled. Valid values are: - Ignore: This will ignore any unknown fields that are silently dropped from the object, and will ignore all but the last duplicate field that the decoder encounters. This is the default behavior prior to v1.23 and is the default behavior when the &#x60;ServerSideFieldValidation&#x60; feature gate is disabled. - Warn: This will send a warning via the standard warning response header for each unknown field that is dropped from the object, and for each duplicate field that is encountered. The request will still succeed if there are no other errors, and will only persist the last of any duplicate fields. This is the default when the &#x60;ServerSideFieldValidation&#x60; feature gate is enabled. - Strict: This will fail the request with a BadRequest error if any unknown fields would be dropped from the object, or if any duplicate fields are present. The error returned from the server will contain all unknown and duplicate fields encountered.
   */
  return k8sRBACAPI
    .createNamespacedRoleBinding(`t-${team}`, roleBindingforWebtop)
    .catch((error) => {
      throw new Error(JSON.stringify(error));
    });
};
module.exports.createRoleBindingForWebtop = createRoleBindingForWebtop;

const createDesktopDeploymentForTeam = async ({ team, passcodeHash }) => {
  const deploymentWrongSecretsDesktopConfig = {
    metadata: {
      name: `t-${team}-virtualdesktop`,
      namespace: `t-${team}`,
      labels: {
        app: 'virtualdesktop',
        team,
        'deployment-context': get('deploymentContext'),
      },
      annotations: {
        'wrongsecrets-ctf-party/lastRequest': `${new Date().getTime()}`,
        'wrongsecrets-ctf-party/lastRequestReadable': new Date().toString(),
        'wrongsecrets-ctf-party/passcode': passcodeHash,
        'wrongsecrets-ctf-party/challengesSolved': '0',
      },
      // ...(await getOwnerReference()),
    },
    spec: {
      selector: {
        matchLabels: {
          app: 'virtualdesktop',
          team,
          'deployment-context': get('deploymentContext'),
        },
      },
      template: {
        metadata: {
          labels: {
            app: 'virtualdesktop',
            team,
            'deployment-context': get('deploymentContext'),
            namespace: `t-${team}`,
          },
        },
        spec: {
          serviceAccountName: 'webtop-sa',
          //automountServiceAccountToken: false,
          // securityContext: {
          //   runAsUser: 911,
          //   runAsGroup: 911,
          //   fsGroup: 911,
          // },
          containers: [
            {
              name: 'virtualdesktop',
              //TODO REPLACE HARDCODED BELOW WITH PROPPER GETS: image: `${get('wrongsecrets.image')}:${get('wrongsecrets.tag')}`,
              image: 'jeroenwillemsen/wrongsecrets-desktop:1.5.4RC7',
              imagePullPolicy: get('virtualdesktop.imagePullPolicy'),
              resources: get('virtualdesktop.resources'),
              securityContext: {
                // allowPrivilegeEscalation: false,
                // readOnlyRootFilesystem: true,
              },
              env: [...get('virtualdesktop.env', [])],
              envFrom: get('virtualdesktop.envFrom'),
              ports: [
                {
                  containerPort: 3000,
                },
              ],
              readinessProbe: {
                httpGet: {
                  path: '/',
                  port: 3000,
                },
                initialDelaySeconds: 24,
                periodSeconds: 2,
                failureThreshold: 10,
              },
              livenessProbe: {
                httpGet: {
                  path: '/',
                  port: 3000,
                },
                initialDelaySeconds: 30,
                periodSeconds: 15,
              },
              volumeMounts: [{ mountPath: '/tmp', name: 'cache-volume' }],
            },
          ],
          volumes: [{ name: 'cache-volume', emptyDir: {} }],
          tolerations: get('virtualdesktop.tolerations'),
          affinity: get('virtualdesktop.affinity'),
          runtimeClassName: get('virtualdesktop.runtimeClassName')
            ? get('virtualdesktop.runtimeClassName')
            : undefined,
        },
      },
    },
  };

  return k8sAppsApi
    .createNamespacedDeployment('t-' + team, deploymentWrongSecretsDesktopConfig)
    .catch((error) => {
      throw new Error(error.response.body.message);
    });
};

module.exports.createDesktopDeploymentForTeam = createDesktopDeploymentForTeam;

const createServiceForTeam = async (teamname) =>
  k8sCoreApi
    .createNamespacedService('t-' + teamname, {
      metadata: {
        namespace: `t-${teamname}`,
        name: `t-${teamname}-wrongsecrets`,
        labels: {
          app: 'wrongsecrets',
          team: teamname,
          'deployment-context': get('deploymentContext'),
        },
        // ...(await getOwnerReference()),
      },
      spec: {
        selector: {
          app: 'wrongsecrets',
          team: teamname,
          'deployment-context': get('deploymentContext'),
        },
        ports: [
          {
            port: 8080,
          },
        ],
      },
    })
    .catch((error) => {
      throw new Error(error.response.body.message);
    });
module.exports.createServiceForTeam = createServiceForTeam;

const createDesktopServiceForTeam = async (teamname) =>
  k8sCoreApi
    .createNamespacedService('t-' + teamname, {
      metadata: {
        name: `t-${teamname}-virtualdesktop`,
        namespace: `t-${teamname}`,
        labels: {
          app: 'virtualdesktop',
          team: teamname,
          'deployment-context': get('deploymentContext'),
        },
        // ...(await getOwnerReference()),
      },
      spec: {
        selector: {
          app: 'virtualdesktop',
          team: teamname,
          'deployment-context': get('deploymentContext'),
        },
        ports: [
          {
            port: 8080,
            targetPort: 3000,
          },
        ],
      },
    })
    .catch((error) => {
      throw new Error(error.response.body.message);
    });
module.exports.createDesktopServiceForTeam = createDesktopServiceForTeam;

//used for owner ref, not used now as we cannot do clusterwide owning of namespaced items:
// async function getOwnerReference() {
//   if (get('skipOwnerReference') === true) {
//     return {};
//   }
//   return {
//     ownerReferences: [
//       {
//         apiVersion: 'apps/v1',
//         blockOwnerDeletion: true,
//         controller: true,
//         kind: 'Deployment',
//         name: 'wrongsecrets-balancer',
//         uid: await getJuiceBalancerDeploymentUid(),
//       },
//     ],
//   };
// }

const getJuiceShopInstances = () =>
  k8sAppsApi
    //namespace: string, pretty?: string, allowWatchBookmarks?: boolean, _continue?: string, fieldSelector?: string, labelSelector?: string, limit?: number, resourceVersion?: string, resourceVersionMatch?: string, timeoutSeconds?: number, watch?: boolean
    // .listDeploymentForAllNamespaces(
    //   get('namespace'), //namespace
    //   true, //alowwatchbookmarks
    //   undefined,//fieldselector
    //   undefined, //labelSelector
    //   undefined, //limit
    //   `app=wrongsecrets,deployment-context=${get('deploymentContext')}`
    .listDeploymentForAllNamespaces(
      true,
      undefined,
      undefined,
      'app in (wrongsecrets, virtualdesktop)',
      200
    )
    .catch((error) => {
      console.log(error);
      throw new Error(error.response.body.message);
    });
module.exports.getJuiceShopInstances = getJuiceShopInstances;

const deleteNamespaceForTeam = async (team) => {
  // await k8sAppsApi
  //   .deleteNamespacedDeployment(`t-${team}-wrongsecrets`, `t-${team}`)
  //   .catch((error) => {
  //     throw new Error(error.response.body.message);
  //   });
  // await k8sAppsApi
  //   .deleteNamespacedDeployment(`t-${team}-virtualdesktop`, `t-${team}`)
  //   .catch((error) => {
  //     throw new Error(error.response.body.message);
  //   });
  await k8sCoreApi.deleteNamespace(`t-${team}`).catch((error) => {
    throw new Error(error.response.body.message);
  });
};
module.exports.deleteNamespaceForTeam = deleteNamespaceForTeam;

// const deleteServiceForTeam = async (team) => {
//   await k8sCoreApi.deleteNamespacedService(`t-${team}-wrongsecrets`, `t-${team}`).catch((error) => {
//     throw new Error(error.response.body.message);
//   });
//   await k8sCoreApi
//     .deleteNamespacedService(`t-${team}-virtualdesktop`, `t-${team}`)
//     .catch((error) => {
//       throw new Error(error.response.body.message);
//     });
// };
// module.exports.deleteServiceForTeam = deleteServiceForTeam;

const deletePodForTeam = async (team) => {
  const res = await k8sCoreApi.listNamespacedPod(
    `t-${team}`,
    true,
    undefined,
    undefined,
    undefined,
    `app=wrongsecrets,team=${team},deployment-context=${get('deploymentContext')}`
  );

  const pods = res.body.items;

  if (pods.length !== 1) {
    throw new Error(`Unexpected number of pods ${pods.length}`);
  }

  const podname = pods[0].metadata.name;

  await k8sCoreApi.deleteNamespacedPod(podname, `t-${team}`);
};
module.exports.deletePodForTeam = deletePodForTeam;

const deleteDesktopPodForTeam = async (team) => {
  const res = await k8sCoreApi.listNamespacedPod(
    `t-${team}`,
    true,
    undefined,
    undefined,
    undefined,
    `app=virtualdesktop,team=${team},deployment-context=${get('deploymentContext')}`
  );

  const pods = res.body.items;

  if (pods.length !== 1) {
    throw new Error(`Unexpected number of pods ${pods.length}`);
  }

  const podname = pods[0].metadata.name;

  await k8sCoreApi.deleteNamespacedPod(podname, `t-${team}`);
};
module.exports.deleteDesktopPodForTeam = deleteDesktopPodForTeam;

const getJuiceShopInstanceForTeamname = (teamname) =>
  k8sAppsApi
    .readNamespacedDeployment(`t-${teamname}-wrongsecrets`, `t-${teamname}`)
    .then((res) => {
      return {
        readyReplicas: res.body.status.readyReplicas,
        availableReplicas: res.body.status.availableReplicas,
        passcodeHash: res.body.metadata.annotations['wrongsecrets-ctf-party/passcode'],
      };
    })
    .catch((error) => {
      throw new Error(error.response.body.message);
    });
module.exports.getJuiceShopInstanceForTeamname = getJuiceShopInstanceForTeamname;

const updateLastRequestTimestampForTeam = (teamname) => {
  const headers = { 'content-type': 'application/strategic-merge-patch+json' };
  return k8sAppsApi.patchNamespacedDeployment(
    `t-${teamname}-wrongsecrets`,
    `t-${teamname}`,
    {
      metadata: {
        annotations: {
          'wrongsecrets-ctf-party/lastRequest': `${new Date().getTime()}`,
          'wrongsecrets-ctf-party/lastRequestReadable': new Date().toString(),
        },
      },
    },
    undefined,
    undefined,
    undefined,
    undefined,
    { headers }
  );
};
module.exports.updateLastRequestTimestampForTeam = updateLastRequestTimestampForTeam;

const changePasscodeHashForTeam = async (teamname, passcodeHash) => {
  const headers = { 'content-type': 'application/strategic-merge-patch+json' };
  const deploymentPatch = {
    metadata: {
      annotations: {
        'wrongsecrets-ctf-party/passcode': passcodeHash,
      },
    },
  };

  await k8sAppsApi.patchNamespacedDeployment(
    `${teamname}-wrongsecrets`,
    `t-${teamname}`,
    deploymentPatch,
    undefined,
    undefined,
    undefined,
    undefined,
    { headers }
  );
};
module.exports.changePasscodeHashForTeam = changePasscodeHashForTeam;
