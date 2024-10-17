const express = require('express')
const {generateSlug} = require('random-word-slugs')
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs')
const { Server } = require('socket.io')
const redis = require('ioredis')
require('dotenv').config()


const app = express()
const PORT=9000

app.use(cors())

const subscriber = new redis(process.env.REDIS_URL)
subscriber.on('error', (err) => {
    console.error('Redis connection error:', err)
})

subscriber.on('connect', () => {
    console.log('Successfully connected to Redis!')
})
const io = new Server({cors: '*'})
io.on('connection', socket => {
    socket.on('subscribe', channel => {
        socket.join(channel)
        socket.emit('message', `Joined ${channel}`)
    })
})


io.listen(9001, console.log('Socket server is listening'))
const ecsClient = new ECSClient({
    region:process.env.AWS_REGION,
    credentials:{
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.SECRETACCESS_KEY
    }
})

const config = {
    CLUSTER: process.env.CLUSTER,
    TASK: process.env.TASK
}

app.use(express.json())


app.post('/project', async (req,res) => {
    const {githubUrl} = req.body
    const projectSlug = generateSlug()

    const command = new RunTaskCommand({
        cluster: config.CLUSTER,
        taskDefinition: config.TASK,
        launchType: 'FARGATE',
        count: 1,
        networkConfiguration: {
            awsvpcConfiguration: {
                assignPublicIp: 'ENABLED',
                subnets: process.env.SUBNETS,
                securityGroups: process.env.SECURITYGROUPS
            }
        },
        overrides: {
            containerOverrides: [
                {
                    name: 'build-image',
                    environment: [
                        {name: 'GIT_REPOSITORY_URL', value: githubUrl},
                        {name: 'PROJECT_ID', value: projectSlug}
                    ]
                }
            ]
        }


    })

    await ecsClient.send(command)
    return res.json({ status: 'queued', data: { projectSlug, url: `http://${projectSlug}.localhost:8000` } })


})
async function initRedisSubscribe() {
    console.log('Subscribed to logs....')
    subscriber.psubscribe('logs:*')

    subscriber.on('pmessage', (pattern, channel, message) => {
        console.log(`Received message on channel ${channel}: ${message}`)  
        
       
        io.to(channel).emit('message', message)
        console.log(`Emitted message to WebSocket room ${channel}`)
    })
}



initRedisSubscribe()

app.listen(PORT, () => {
    console.log(`Server is listening at ${PORT}`);
    
})


