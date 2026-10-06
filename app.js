import express from 'express'


const app = express()
const port = process.env.PORT ?? 3000

app.get("/", (req, res) => {
    return res.json({
        msg: "hello from server v2"
    })
})


app.listen(port, () => {
    console.log(`Server is running on Port ${port}`)
})