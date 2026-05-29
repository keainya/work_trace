package object

import (
	"fmt"
	"os"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

var Database *gorm.DB

func init() {
	os.MkdirAll("data", 0755)
	var err error
	Database, err = gorm.Open(sqlite.Open("data/service_temp.db"), &gorm.Config{})
	if err != nil {
		panic(err)
	}

	fmt.Println(Database)
}
