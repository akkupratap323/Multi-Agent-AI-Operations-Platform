#!/usr/bin/env node

/**
 * AWS Lightsail + CloudWatch utilities
 * Wraps AWS CLI calls using execSync for metrics, logs, and resource discovery
 * Supports: Lightsail instances, Lightsail databases, Lightsail load balancers,
 *           Lightsail containers, and standard EC2/ECS/Lambda/RDS/ALB
 */

const { execSync } = require('child_process');
const config = require('../config');

const REGION = config.AWS_REGION;

function runAWS(cmd) {
  try {
    const output = execSync(`aws ${cmd} --region ${REGION} --output json`, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 15000
    });
    return JSON.parse(output);
  } catch (error) {
    console.error(`AWS CLI error: ${error.message.split('\n')[0]}`);
    return null;
  }
}

// ============================================================
// LIGHTSAIL INSTANCES
// ============================================================

function listLightsailInstances() {
  const data = runAWS('lightsail get-instances');
  if (!data || !data.instances) return [];

  return data.instances.filter(i => i.state.name === 'running').map(inst => ({
    name: inst.name,
    arn: inst.arn,
    ip: inst.publicIpAddress,
    privateIp: inst.privateIpAddress,
    blueprint: inst.blueprintName,
    bundle: inst.bundleId,
    cpuCount: inst.hardware.cpuCount,
    ramGb: inst.hardware.ramSizeInGb,
    diskGb: inst.hardware.disks?.[0]?.sizeInGb || 0,
    state: inst.state.name,
    tags: inst.tags || []
  }));
}

function getLightsailMetric(instanceName, metricName, unit, stat = 'Average') {
  const now = new Date();
  const start = new Date(now - 300 * 1000); // last 5 minutes

  const data = runAWS(
    `lightsail get-instance-metric-data ` +
    `--instance-name "${instanceName}" ` +
    `--metric-name ${metricName} ` +
    `--period 300 ` +
    `--start-time "${start.toISOString()}" ` +
    `--end-time "${now.toISOString()}" ` +
    `--unit ${unit} ` +
    `--statistics ${stat}`
  );

  if (!data || !data.metricData || data.metricData.length === 0) return null;

  // Return most recent datapoint
  const sorted = data.metricData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return sorted[0][stat.toLowerCase()] ?? sorted[0].average ?? null;
}

function getLightsailInstanceMetrics(instanceName) {
  return {
    CPUUtilization: getLightsailMetric(instanceName, 'CPUUtilization', 'Percent', 'Average'),
    NetworkIn: getLightsailMetric(instanceName, 'NetworkIn', 'Bytes', 'Sum'),
    NetworkOut: getLightsailMetric(instanceName, 'NetworkOut', 'Bytes', 'Sum'),
    StatusCheckFailed: getLightsailMetric(instanceName, 'StatusCheckFailed', 'Count', 'Sum'),
    StatusCheckFailed_Instance: getLightsailMetric(instanceName, 'StatusCheckFailed_Instance', 'Count', 'Sum'),
    StatusCheckFailed_System: getLightsailMetric(instanceName, 'StatusCheckFailed_System', 'Count', 'Sum'),
    BurstCapacityPercentage: getLightsailMetric(instanceName, 'BurstCapacityPercentage', 'Percent', 'Average'),
    BurstCapacityTime: getLightsailMetric(instanceName, 'BurstCapacityTime', 'Seconds', 'Average')
  };
}

// ============================================================
// LIGHTSAIL DATABASES
// ============================================================

function listLightsailDatabases() {
  const data = runAWS('lightsail get-relational-databases');
  if (!data || !data.relationalDatabases) return [];

  return data.relationalDatabases.map(db => ({
    name: db.name,
    engine: db.engine,
    engineVersion: db.engineVersion,
    state: db.state,
    masterEndpoint: db.masterEndpoint,
    bundle: db.relationalDatabaseBundleId
  }));
}

function getLightsailDBMetric(dbName, metricName, unit, stat = 'Average') {
  const now = new Date();
  const start = new Date(now - 300 * 1000);

  const data = runAWS(
    `lightsail get-relational-database-metric-data ` +
    `--relational-database-name "${dbName}" ` +
    `--metric-name ${metricName} ` +
    `--period 300 ` +
    `--start-time "${start.toISOString()}" ` +
    `--end-time "${now.toISOString()}" ` +
    `--unit ${unit} ` +
    `--statistics ${stat}`
  );

  if (!data || !data.metricData || data.metricData.length === 0) return null;
  const sorted = data.metricData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return sorted[0][stat.toLowerCase()] ?? sorted[0].average ?? null;
}

function getLightsailDBMetrics(dbName) {
  return {
    CPUUtilization: getLightsailDBMetric(dbName, 'CPUUtilization', 'Percent'),
    DatabaseConnections: getLightsailDBMetric(dbName, 'DatabaseConnections', 'Count', 'Sum'),
    FreeStorageSpace: getLightsailDBMetric(dbName, 'FreeStorageSpace', 'Bytes'),
    NetworkReceiveThroughput: getLightsailDBMetric(dbName, 'NetworkReceiveThroughput', 'Bytes', 'Average'),
    NetworkTransmitThroughput: getLightsailDBMetric(dbName, 'NetworkTransmitThroughput', 'Bytes', 'Average')
  };
}

// ============================================================
// LIGHTSAIL LOAD BALANCERS
// ============================================================

function listLightsailLoadBalancers() {
  const data = runAWS('lightsail get-load-balancers');
  if (!data || !data.loadBalancers) return [];

  return data.loadBalancers.map(lb => ({
    name: lb.name,
    dnsName: lb.dnsName,
    state: lb.state,
    protocol: lb.protocol,
    healthCheckPath: lb.healthCheckPath,
    instanceHealthSummary: lb.instanceHealthSummary
  }));
}

function getLightsailLBMetric(lbName, metricName, unit, stat = 'Sum') {
  const now = new Date();
  const start = new Date(now - 300 * 1000);

  const data = runAWS(
    `lightsail get-load-balancer-metric-data ` +
    `--load-balancer-name "${lbName}" ` +
    `--metric-name ${metricName} ` +
    `--period 300 ` +
    `--start-time "${start.toISOString()}" ` +
    `--end-time "${now.toISOString()}" ` +
    `--unit ${unit} ` +
    `--statistics ${stat}`
  );

  if (!data || !data.metricData || data.metricData.length === 0) return null;
  const sorted = data.metricData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return sorted[0][stat.toLowerCase()] ?? null;
}

// ============================================================
// LIGHTSAIL CONTAINERS
// ============================================================

function listLightsailContainers() {
  const data = runAWS('lightsail get-container-services');
  if (!data || !data.containerServices) return [];

  return data.containerServices.map(cs => ({
    name: cs.containerServiceName,
    state: cs.state,
    scale: cs.scale,
    power: cs.power,
    url: cs.url
  }));
}

// ============================================================
// STANDARD EC2 (kept for future use)
// ============================================================

function listEC2Instances() {
  const data = runAWS(
    `ec2 describe-instances --filters "Name=instance-state-name,Values=running"`
  );
  if (!data || !data.Reservations) return [];

  const instances = [];
  for (const res of data.Reservations) {
    for (const inst of res.Instances) {
      const nameTag = (inst.Tags || []).find(t => t.Key === 'Name');
      instances.push({
        id: inst.InstanceId,
        name: nameTag ? nameTag.Value : inst.InstanceId,
        type: inst.InstanceType,
        state: inst.State.Name
      });
    }
  }
  return instances;
}

function getEC2Metrics(instanceId) {
  const now = new Date();
  const start = new Date(now - 300 * 1000);
  const dims = `Name=InstanceId,Value=${instanceId}`;

  const getCWMetric = (metric, stat = 'Average') => {
    const data = runAWS(
      `cloudwatch get-metric-statistics --namespace AWS/EC2 --metric-name ${metric} ` +
      `--dimensions ${dims} --start-time ${start.toISOString()} --end-time ${now.toISOString()} ` +
      `--period 300 --statistics ${stat}`
    );
    if (!data || !data.Datapoints || data.Datapoints.length === 0) return null;
    const sorted = data.Datapoints.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
    return sorted[0][stat];
  };

  return {
    CPUUtilization: getCWMetric('CPUUtilization'),
    StatusCheckFailed: getCWMetric('StatusCheckFailed', 'Maximum')
  };
}

// ============================================================
// CloudWatch Logs
// ============================================================

function getLogEvents(logGroupName, startTimeMs, filterPattern = 'ERROR', limit = 50) {
  const data = runAWS(
    `logs filter-log-events ` +
    `--log-group-name "${logGroupName}" ` +
    `--start-time ${startTimeMs} ` +
    `--filter-pattern "${filterPattern}" ` +
    `--limit ${limit}`
  );
  if (!data || !data.events) return [];
  return data.events.map(e => ({
    timestamp: new Date(e.timestamp).toISOString(),
    message: e.message.substring(0, 500)
  }));
}

function findLogGroups(prefix) {
  const data = runAWS(`logs describe-log-groups --log-group-name-prefix "${prefix}"`);
  if (!data || !data.logGroups) return [];
  return data.logGroups.map(g => g.logGroupName);
}

// ============================================================
// STANDARD RDS
// ============================================================

function listRDSInstances() {
  const data = runAWS('rds describe-db-instances');
  if (!data || !data.DBInstances) return [];

  return data.DBInstances.map(db => ({
    id: db.DBInstanceIdentifier,
    engine: db.Engine,
    status: db.DBInstanceStatus,
    endpoint: db.Endpoint.Address,
    port: db.Endpoint.Port,
    multiAZ: db.MultiAZ,
  }));
}

// ============================================================
// STANDARD Lambda
// ============================================================

function listLambdaFunctions() {
  const data = runAWS('lambda list-functions');
  if (!data || !data.Functions) return [];

  return data.Functions.map(func => ({
    name: func.FunctionName,
    runtime: func.Runtime,
    memory: func.MemorySize,
    lastModified: func.LastModified,
  }));
}

// ============================================================
// STANDARD ECS
// ============================================================

function listECSClusters() {
  const data = runAWS('ecs list-clusters');
  if (!data || !data.clusterArns) return [];

  const describeData = runAWS(`ecs describe-clusters --clusters ${data.clusterArns.join(' ')}`);
  if (!describeData || !describeData.clusters) return [];

  return describeData.clusters.map(cluster => ({
    name: cluster.clusterName,
    status: cluster.status,
    runningTasksCount: cluster.runningTasksCount,
    pendingTasksCount: cluster.pendingTasksCount,
  }));
}

// ============================================================
// STANDARD ALB (Application Load Balancers)
// ============================================================

function listALBs() {
  const data = runAWS('elbv2 describe-load-balancers');
  if (!data || !data.LoadBalancers) return [];

  return data.LoadBalancers.map(lb => ({
    name: lb.LoadBalancerName,
    arn: lb.LoadBalancerArn,
    state: lb.State.Code,
    type: lb.Type,
    dnsName: lb.DNSName,
  }));
}


module.exports = {
  runAWS,
  // Lightsail
  listLightsailInstances, getLightsailInstanceMetrics, getLightsailMetric,
  listLightsailDatabases, getLightsailDBMetrics,
  listLightsailLoadBalancers, getLightsailLBMetric,
  listLightsailContainers,
  // Standard EC2
  listEC2Instances, getEC2Metrics,
  // Standard RDS
  listRDSInstances,
  // Standard Lambda
  listLambdaFunctions,
  // Standard ECS
  listECSClusters,
  // Standard ALB
  listALBs,
  // Logs
  getLogEvents, findLogGroups
};
