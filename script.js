const { execSync } = require("child_process")
const fs = require("fs")
const path = require("path")
const jsYaml = require("js-yaml")
const transliteration = require("transliteration")

const savePath = path.join(__dirname, "..", "src", "store", "schemasJSON")
const outputPath = path.join(__dirname, "..", "src", "store")

const urls = ["youre api from JSON schema"]

async function readStream(stream) {
  const reader = stream.getReader()
  let result = []

  return new Promise((resolve, reject) => {
    function read() {
      reader
        .read()
        .then(({ done, value }) => {
          if (done) {
            resolve(Buffer.concat(result).toString())
          } else {
            result.push(value)
            read()
          }
        })
        .catch(reject)
    }

    read()
  })
}

const fetchStreams = urls.map((url) =>
  fetch(url)
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`)
      }
      return res.body
    })
    .catch((error) => console.log(error)),
)

const resultsArray = []

const getJSONS = Promise.all(fetchStreams)
  .then((streams) => Promise.all(streams.map((stream) => readStream(stream))))
  .then((results) => {
    resultsArray.push(...results)

    for (let i = 0; results.length > i; i++) {
      console.log(results.length)
      if (results[i][0] === "{") {
        const jsonData = JSON.parse(results[i])
        fs.writeFileSync(
          `${savePath}/${transliteration
            .transliterate(jsonData.info.description)
            .replace(/\s/g, "")}.json`,
          results[i],
        )
      } else if (results[i][0] === "o") {
        const yamlData = results[i]
        const yamlObject = jsYaml.load(yamlData) // Разбираем YAML
        const description = transliteration.transliterate(yamlObject.info.description)
        const yamlFileName = `${description.replace(/\s/g, "")}.yaml` // Используем описание для имени файла
        const yamlFilePath = path.join(savePath, yamlFileName)
        fs.writeFileSync(yamlFilePath, yamlData)
      }
    }
  })
  .catch(console.log)

getJSONS.then(() => {
  resultsArray.forEach((data) => {
    let jsonData

    try {
      jsonData = JSON.parse(data)
    } catch (jsonError) {
      try {
        jsonData = jsYaml.load(data)
      } catch (yamlError) {
        console.error("Error parsing JSON/YAML:", jsonError, yamlError)
        return
      }
    }
    const description = transliteration.transliterate(jsonData.info.description).replace(/\s/g, "")

    const jsonFilePath = `${savePath}/${description}.json`
    const yamlFilePath = `${savePath}/${description}.yaml`

    let inputFilePath

    if (fs.existsSync(jsonFilePath)) {
      console.log(`JSON file found: ${jsonFilePath}`)
      inputFilePath = jsonFilePath
    } else if (fs.existsSync(yamlFilePath)) {
      console.log(`YAML file found: ${yamlFilePath}`)
      inputFilePath = yamlFilePath
    } else {
      console.error(`Neither JSON nor YAML file found for description: ${description}`)
      return
    }

    const outputFilePath = `${outputPath}/types/${transliteration.transliterate(jsonData.info.description)}.ts`

    const inputFilePathWithoutSpaces = inputFilePath.replace(/\s/g, "")
    const outputFilePathWithoutSpaces = outputFilePath.replace(/\s/g, "")

    const command = `npx openapi-typescript ${inputFilePathWithoutSpaces} -o ${outputFilePathWithoutSpaces}`

    try {
      execSync(command)
      console.log(`Generation successful for ${inputFilePathWithoutSpaces}`)
    } catch (error) {
      console.error(`Error generating types for ${outputFilePathWithoutSpaces}:`, error)
    }
  })
})
