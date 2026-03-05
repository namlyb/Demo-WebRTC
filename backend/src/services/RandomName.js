import pokemon from "pokemon";

class RandomNameService {
  static generate() {
    try {
      return pokemon.random("en");
    } catch (err) {
      return pokemon.random("en");
    }
  }
}

export default RandomNameService;